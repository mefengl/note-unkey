/**
 * @fileoverview 获取密钥详情API实现
 * 
 * 该文件实现了查询单个API密钥详细信息的功能。
 * 主要特性：
 * 1. 支持查看密钥基本信息
 * 2. 可选择性解密显示原始密钥（需要特殊权限）
 * 3. 返回完整的密钥配置（限制、权限等）
 * 4. 包含相关身份信息
 */

import type { App } from "@/pkg/hono/app";
import { createRoute, z } from "@hono/zod-openapi";
import { rootKeyAuth } from "@/pkg/auth/root_key";
import { UnkeyApiError, openApiErrorResponses } from "@/pkg/errors";
import { retry } from "@/pkg/util/retry";
import { buildUnkeyQuery } from "@unkey/rbac";
import { keySchema } from "./schema";

/**
 * API路由定义
 */
const route = createRoute({
  tags: ["keys"],
  operationId: "getKey",
  method: "get",
  path: "/v1/keys.getKey",
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      // 要查询的密钥ID
      keyId: z.string().min(1).openapi({
        description: "需要获取的密钥ID",
        example: "key_1234",
      }),
      // 是否解密显示原始密钥
      decrypt: z.coerce.boolean().optional().openapi({
        description: "是否解密并显示原始密钥。仅当密钥在生成时启用了加密存储时可用。",
      }),
    }),
  },
  responses: {
    200: {
      description: "密钥详细配置信息",
      content: {
        "application/json": {
          schema: keySchema,
        },
      },
    },
    ...openApiErrorResponses,
  },
});

// 类型导出
export type Route = typeof route;
export type V1KeysGetKeyResponse = z.infer<
  (typeof route.responses)[200]["content"]["application/json"]["schema"]
>;

/**
 * API处理函数注册
 * 实现密钥详情查询的核心逻辑
 */
export const registerV1KeysGetKey = (app: App) =>
  app.openapi(route, async (c) => {
    // 1. 获取并验证请求参数
    const { keyId, decrypt } = c.req.valid("query");
    const { cache, db, vault, rbac } = c.get("services");

    // 2. 从缓存或数据库获取密钥信息
    const { val: data, err } = await cache.keyById.swr(keyId, async () => {
      // 查询密钥及其关联信息
      const dbRes = await db.readonly.query.keys.findFirst({
        where: (table, { eq, and, isNull }) => and(eq(table.id, keyId), isNull(table.deletedAtM)),
        with: {
          encrypted: true, // 加密信息
          permissions: { with: { permission: true } }, // 权限信息
          roles: { with: { role: true } }, // 角色信息
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
        key: dbRes,
        api: dbRes.keyAuth.api,
        permissions: dbRes.permissions.map((p) => p.permission.name),
        roles: dbRes.roles.map((p) => p.role.name),
        identity: dbRes.identity
          ? {
              id: dbRes.identity.id,
              externalId: dbRes.identity.externalId,
              meta: dbRes.identity.meta ?? {},
            }
          : null,
      };
    });

    // 3. 错误处理
    if (err) {
      throw new UnkeyApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: `unable to load key: ${err.message}`,
      });
    }
    if (!data) {
      throw new UnkeyApiError({
        code: "NOT_FOUND",
        message: `key ${keyId} not found`,
      });
    }

    // 4. 提取数据
    const { api, key } = data;

    // 5. 权限验证
    const auth = await rootKeyAuth(
      c,
      buildUnkeyQuery(({ or }) => or("*", "api.*.read_key", `api.${api.id}.read_key`)),
    );
    
    // 验证工作区权限
    if (key.workspaceId !== auth.authorizedWorkspaceId) {
      throw new UnkeyApiError({
        code: "NOT_FOUND",
        message: `key ${keyId} not found`,
      });
    }

    // 6. 处理元数据
    let meta = key.meta ? JSON.parse(key.meta) : undefined;
    if (!meta || Object.keys(meta).length === 0) {
      meta = undefined;
    }

    // 7. 处理密钥解密请求
    let plaintext: string | undefined = undefined;
    if (decrypt) {
      // 检查解密权限
      const { val, err } = rbac.evaluatePermissions(
        buildUnkeyQuery(({ or }) => or("*", "api.*.decrypt_key", `api.${api.id}.decrypt_key`)),
        auth.permissions,
      );
      
      if (err) {
        throw new UnkeyApiError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to evaluate permission",
        });
      }
      if (!val.valid) {
        throw new UnkeyApiError({
          code: "UNAUTHORIZED",
          message: "you're not allowed to decrypt this key",
        });
      }

      // 如果存在加密数据，执行解密
      if (key.encrypted) {
        const decryptRes = await retry(3, () =>
          vault.decrypt(c, {
            keyring: key.workspaceId,
            encrypted: key.encrypted!.encrypted,
          }),
        );
        plaintext = decryptRes.plaintext;
      }
    }

    // 8. 返回完整的密钥信息
    return c.json({
      // 基本信息
      id: key.id,
      start: key.start,
      apiId: api.id,
      workspaceId: key.workspaceId,
      name: key.name ?? undefined,
      ownerId: key.ownerId ?? undefined,
      meta: key.meta ? JSON.parse(key.meta) : undefined,
      
      // 时间信息
      createdAt: key.createdAtM,
      updatedAt: key.updatedAtM ?? undefined,
      expires: key.expires?.getTime() ?? undefined,
      
      // 使用限制
      remaining: key.remaining ?? undefined,
      
      // 自动补充配置
      refill: key.refillAmount
        ? {
            interval: key.refillDay ? ("monthly" as const) : ("daily" as const),
            amount: key.refillAmount,
            refillDay: key.refillDay,
            lastRefillAt: key.lastRefillAt?.getTime(),
          }
        : undefined,
      
      // 速率限制配置
      ratelimit:
        key.ratelimitAsync !== null && key.ratelimitLimit !== null && key.ratelimitDuration !== null
          ? {
              async: key.ratelimitAsync,
              type: key.ratelimitAsync ? "fast" : ("consistent" as any),
              limit: key.ratelimitLimit,
              duration: key.ratelimitDuration,
              refillRate: key.ratelimitLimit,
              refillInterval: key.ratelimitDuration,
            }
          : undefined,
      
      // 权限和角色
      roles: data.roles,
      permissions: data.permissions,
      
      // 状态
      enabled: key.enabled,
      
      // 解密后的原始密钥（如果请求且有权限）
      plaintext,
      
      // 关联的身份信息
      identity: data.identity
        ? {
            id: data.identity.id,
            externalId: data.identity.externalId,
            meta: data.identity.meta ?? undefined,
          }
        : undefined,
    });
  });
