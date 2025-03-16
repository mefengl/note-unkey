/**
 * @fileoverview 根密钥(Root Key)认证实现
 * 
 * 这是 Unkey 系统中最核心的安全实现之一。根密钥类似于"超级管理员密钥"，
 * 用于管理整个系统中的其他 API 密钥。
 * 
 * 核心概念:
 * - Root Key: 最高权限的密钥，可以创建和管理其他密钥
 * - Bearer Token: HTTP 认证头中的令牌格式
 * - 工作区(Workspace): 密钥的隔离范围
 * 
 * 认证流程:
 * 1. 提取 HTTP Authorization 头中的 Bearer Token
 * 2. 通过 KeyService 验证密钥的有效性
 * 3. 检查工作区状态(是否被禁用)
 * 4. 验证是否具有根密钥权限
 * 5. 异步记录认证事件用于审计
 * 
 * 安全考虑:
 * - 所有错误返回统一的错误格式
 * - 禁用的工作区立即失效
 * - 记录所有认证尝试便于审计
 * - 权限粒度可细化控制
 */

import { SchemaError } from "@unkey/error";
import type { PermissionQuery } from "@unkey/rbac";
import type { Context } from "hono";
import { UnkeyApiError } from "../errors";
import type { HonoEnv } from "../hono/env";
import { DisabledWorkspaceError } from "../keys/service";

/**
 * 根密钥认证中间件函数
 * 这个函数会被其他 API 路由调用，用于验证请求者是否持有有效的根密钥。
 * 
 * @param c - Hono 上下文对象，包含 HTTP 请求信息和环境配置
 * @param permissionQuery - 可选的权限查询条件，用于细化权限控制
 * @throws {UnkeyApiError} 当认证失败时抛出统一格式的错误
 * @returns 验证成功的根密钥信息
 * 
 * 示例:
 * ```ts
 * // 在 API 路由中使用
 * app.post("/keys.create", async (c) => {
 *   const auth = await rootKeyAuth(c, {
 *     permissions: ["create_key"]
 *   });
 *   // 继续处理请求...
 * });
 * ```
 */
export async function rootKeyAuth(c: Context<HonoEnv>, permissionQuery?: PermissionQuery) {
  // 1. 提取认证头
  const authorization = c.req.header("authorization")?.replace("Bearer ", "");
  if (!authorization) {
    throw new UnkeyApiError({ code: "UNAUTHORIZED", message: "key required" });
  }

  // 2. 获取核心服务实例
  const { keyService, analytics } = c.get("services");

  // 3. 验证密钥
  const { val: rootKey, err } = await keyService.verifyKey(c, {
    key: authorization,
    permissionQuery,
  });

  // 4. 错误处理
  if (err) {
    switch (true) {
      case err instanceof SchemaError:
        throw new UnkeyApiError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      case err instanceof DisabledWorkspaceError:
        throw new UnkeyApiError({
          code: "FORBIDDEN",
          message: "workspace is disabled",
        });
    }
    throw new UnkeyApiError({
      code: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }

  // 5. 处理密钥不存在的情况
  if (!rootKey.key) {
    throw new UnkeyApiError({
      code: "UNAUTHORIZED",
      message: "key not found",
    });
  }

  // 6. 异步记录认证事件
  c.executionCtx.waitUntil(
    analytics.insertKeyVerification({
      workspace_id: rootKey.key.workspaceId,
      key_id: rootKey.key.id,
      time: Date.now(),
      outcome: rootKey.code ?? "VALID",
      key_space_id: rootKey.key.keyAuthId,
      region: c.req.raw.cf?.colo ?? "", // Cloudflare 特定的区域信息
      request_id: c.get("requestId"),
      tags: [],
    }),
  );

  // 7. 验证密钥状态
  if (!rootKey.valid) {
    throw new UnkeyApiError({
      code: rootKey.code,
      message: "message" in rootKey && rootKey.message ? rootKey.message : "unauthorized",
    });
  }

  // 8. 最终确认是否具有根密钥权限
  if (!rootKey.isRootKey) {
    throw new UnkeyApiError({
      code: "UNAUTHORIZED",
      message: "root key required",
    });
  }

  return rootKey;
}
