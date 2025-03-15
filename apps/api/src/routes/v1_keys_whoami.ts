/**
 * @fileoverview 密钥身份信息查询API实现
 * 
 * 该文件实现了通过API密钥查询其关联身份和基本信息的功能。
 * 这是一个轻量级的验证接口，主要用于：
 * 1. 验证密钥的有效性
 * 2. 获取密钥关联的身份信息
 * 3. 查看密钥的基本配置
 * 
 * 与 getKey 接口相比，该接口:
 * - 使用密钥本身而不是密钥ID进行查询
 * - 返回更少的信息，更适合频繁调用
 * - 主要用于身份验证场景
 */

import type { App } from "@/pkg/hono/app";
import { createRoute, z } from "@hono/zod-openapi";
import { rootKeyAuth } from "@/pkg/auth/root_key";
import { UnkeyApiError, openApiErrorResponses } from "@/pkg/errors";
import { sha256 } from "@unkey/hash";
import { buildUnkeyQuery } from "@unkey/rbac";

/**
 * API路由定义
 */
const route = createRoute({
  tags: ["keys"],
  operationId: "whoami",
  method: "post",
  path: "/v1/keys.whoami",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            // 待验证的密钥
            key: z.string().min(1).openapi({
              description: "需要查询的API密钥原文",
              example: "sk_123",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "密钥配置信息",
      content: {
        "application/json": {
          schema: z.object({
            // 密钥ID
            id: z.string().openapi({
              description: "密钥唯一标识",
              example: "key_123",
            }),
            // 密钥名称
            name: z.string().optional().openapi({
              description: "密钥的人类可读名称",
              example: "API Key 1",
            }),
            // 剩余使用次数
            remaining: z.number().int().optional().openapi({
              description: "密钥的剩余可用次数",
              example: 1000,
            }),
            // 关联的身份信息
            identity: z
              .object({
                // 身份ID
                id: z.string().openapi({
                  description: "关联身份的内部ID",
                  example: "id_123",
                }),
                // 外部身份ID
                externalId: z.string().openapi({
                  description: "关联身份的外部ID（如用户ID）",
                  example: "ext123",
                }),
              })
              .optional()
              .openapi({
                description: "密钥关联的身份信息",
              }),
            // 元数据
            meta: z
              .record(z.unknown())
              .optional()
              .openapi({
                description: "密钥的自定义元数据",
                example: { role: "admin", plan: "premium" },
              }),
            // 创建时间
            createdAt: z.number().int().openapi({
              description: "密钥创建时间（毫秒时间戳）",
              example: 1620000000000,
            }),
            // 启用状态
            enabled: z.boolean().openapi({
              description: "密钥是否启用",
              example: true,
            }),
            // 环境标识
            environment: z.string().optional().openapi({
              description: "密钥所属环境",
              example: "production",
            }),
          }),
        },
      },
    },
    ...openApiErrorResponses,
  },
});

// 类型导出
export type Route = typeof route;
export type V1KeysWhoAmIRequest = z.infer<
  (typeof route.request.body.content)["application/json"]["schema"]
>;
export type V1KeysWhoAmIResponse = z.infer<
  (typeof route.responses)[200]["content"]["application/json"]["schema"]
>;

/**
 * API处理函数注册
 * 实现密钥身份查询的核心逻辑
 */
export const registerV1KeysWhoAmI = (app: App) =>
  app.openapi(route, async (c) => {
    // 1. 获取并验证请求参数
    const { key: secret } = c.req.valid("json");
    const { cache, db } = c.get("services");

    // 2. 计算密钥哈希
    const hash = await sha256(secret);

    // 3. 从缓存或数据库获取密钥信息
    const { val: data, err } = await cache.keyByHash.swr(hash, async () => {
      // 查询密钥及其关联信息
      const dbRes = await db.readonly.query.keys.findFirst({
        where: (table, { eq, and, isNull }) => and(eq(table.hash, hash), isNull(table.deletedAtM)),
        with: {
          keyAuth: {
            with: {
              api: true, // API信息
            },
          },
          identity: true, // 身份信息
        },
      });

      if (!dbRes) {
        return null;
      }

      // 整理返回数据结构
      return {
        key: {
          ...dbRes,
        },
        api: dbRes.keyAuth.api,
        identity: dbRes.identity,
      } as any; // 类型断言以避免返回workspace等keyByHash中定义的其他类型
    });

    // 4. 错误处理
    if (err) {
      throw new UnkeyApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: `unable to load key: ${err.message}`,
      });
    }
    if (!data) {
      throw new UnkeyApiError({
        code: "NOT_FOUND",
        message: "Key not found",
      });
    }

    // 5. 提取数据
    const { api, key } = data;

    // 6. 权限验证
    const auth = await rootKeyAuth(
      c,
      buildUnkeyQuery(({ or }) => or("*", "api.*.read_key", `api.${api.id}.read_key`)),
    );
    
    // 验证工作区权限
    if (key.workspaceId !== auth.authorizedWorkspaceId) {
      throw new UnkeyApiError({
        code: "NOT_FOUND",
        message: "Key not found",
      });
    }

    // 7. 处理元数据
    let meta = key.meta ? JSON.parse(key.meta) : undefined;
    if (!meta || Object.keys(meta).length === 0) {
      meta = undefined;
    }

    // 8. 返回结果
    return c.json({
      // 基本信息
      id: key.id,
      name: key.name ?? undefined,
      remaining: key.remaining ?? undefined,
      
      // 身份信息
      identity: data.identity
        ? {
            id: data.identity.id,
            externalId: data.identity.externalId,
          }
        : undefined,
      
      // 元数据和状态
      meta: meta,
      createdAt: key.createdAtM,
      enabled: key.enabled,
      environment: key.environment ?? undefined,
    });
  });
