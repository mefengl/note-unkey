/**
 * @fileoverview 根密钥认证实现
 * 
 * 这个文件实现了 Unkey 系统中最重要的根密钥(Root Key)认证机制。
 * 根密钥是整个系统中权限最高的密钥，用于管理其他 API 密钥。
 * 
 * 主要功能：
 * 1. 验证请求中的 Bearer Token 是否是有效的根密钥
 * 2. 处理各种认证失败场景
 * 3. 记录认证事件用于分析
 * 
 * 认证流程：
 * 1. 从请求头获取 Authorization Token
 * 2. 通过 KeyService 验证密钥
 * 3. 处理验证结果和错误情况
 * 4. 发送认证事件到分析服务
 * 5. 确认是根密钥权限
 */

import { SchemaError } from "@unkey/error";
import type { PermissionQuery } from "@unkey/rbac";
import type { Context } from "hono";
import { UnkeyApiError } from "../errors";
import type { HonoEnv } from "../hono/env";
import { DisabledWorkspaceError } from "../keys/service";

/**
 * 根密钥认证中间件函数
 * 
 * @param c - Hono 上下文，包含请求信息和环境配置
 * @param permissionQuery - 可选的权限查询参数，用于细化权限检查
 * @throws {UnkeyApiError} 当认证失败时抛出对应错误
 * @returns 验证成功的根密钥信息
 */
export async function rootKeyAuth(c: Context<HonoEnv>, permissionQuery?: PermissionQuery) {
  // 从请求头提取 Bearer Token
  const authorization = c.req.header("authorization")?.replace("Bearer ", "");
  if (!authorization) {
    throw new UnkeyApiError({ code: "UNAUTHORIZED", message: "key required" });
  }

  // 获取核心服务实例
  const { keyService, analytics } = c.get("services");

  // 验证密钥的有效性
  const { val: rootKey, err } = await keyService.verifyKey(c, {
    key: authorization,
    permissionQuery,
  });

  // 错误处理逻辑
  if (err) {
    switch (true) {
      // 参数格式错误
      case err instanceof SchemaError:
        throw new UnkeyApiError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      // 工作区被禁用
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

  // 密钥不存在
  if (!rootKey.key) {
    throw new UnkeyApiError({
      code: "UNAUTHORIZED",
      message: "key not found",
    });
  }

  // 异步记录认证事件
  // 注意: 使用 waitUntil 确保在响应发送后也能完成事件记录
  c.executionCtx.waitUntil(
    analytics.insertKeyVerification({
      workspace_id: rootKey.key.workspaceId,
      key_id: rootKey.key.id,
      time: Date.now(),
      outcome: rootKey.code ?? "VALID",
      key_space_id: rootKey.key.keyAuthId,
      // Cloudflare 特定的区域信息
      region: c.req.cf?.region,
      request_id: c.get("requestId"),
      tags: [],
    }),
  );

  // 密钥无效（可能已过期或被禁用）
  if (!rootKey.valid) {
    throw new UnkeyApiError({
      code: rootKey.code,
      message: "message" in rootKey && rootKey.message ? rootKey.message : "unauthorized",
    });
  }

  // 最后确认是否具有根密钥权限
  if (!rootKey.isRootKey) {
    throw new UnkeyApiError({
      code: "UNAUTHORIZED",
      message: "root key required",
    });
  }

  return rootKey;
}
