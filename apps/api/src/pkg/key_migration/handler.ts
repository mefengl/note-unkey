/**
 * 密钥迁移错误系统
 * 
 * 想象你在搬家时整理钥匙：
 * - 有些钥匙配不上锁了（密钥不匹配）
 * - 钥匙生锈了需要修复（密钥数据损坏）
 * - 新家的锁不适合旧钥匙（密钥格式不兼容）
 * 
 * 这个模块处理在迁移API密钥时可能出现的各种问题
 */

import { BaseError, Err, Ok, type Result } from "@unkey/error";

import { newId } from "@unkey/id";
import { ConsoleLogger } from "@unkey/worker-logging";
import { createConnection, schema } from "../db";
import type { Env } from "../env";
import type { MessageBody } from "./message";

/**
 * 密钥迁移错误类
 * 处理迁移过程中发生的问题
 */
export class MigrationError extends BaseError {
  /**
   * 错误类型名称
   */
  public readonly name = "MigrationError";

  /**
   * 是否可以重试
   * 迁移错误通常无法通过重试解决，需要手动处理
   */
  public readonly retry = false;
}

/**
 * 执行密钥迁移操作
 * 将API密钥从旧系统迁移到新系统
 * 
 * @param message 包含迁移信息的消息体
 * @param env 运行环境配置
 * @returns 成功返回新密钥ID，失败返回迁移错误
 * 
 * @example
 * const result = await migrateKey({
 *   keyId: "old_key_123",
 *   workspaceId: "ws_1"
 * }, env);
 * 
 * if (result.ok) {
 *   console.log("迁移成功，新密钥ID:", result.value.keyId);
 * } else {
 *   console.error("迁移失败:", result.error.message);
 * }
 */
export async function migrateKey(
  message: MessageBody,
  env: Env,
): Promise<Result<{ keyId: string }, MigrationError>> {
  const db = createConnection({
    host: env.DATABASE_HOST,
    username: env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    retry: 3,
    logger: new ConsoleLogger({ requestId: "", application: "api", environment: env.ENVIRONMENT }),
  });

  const keyId = newId("key");

  // name -> id
  const roles: Record<string, string> = {};

  if (message.roles && message.roles.length > 0) {
    const found = await db.query.roles.findMany({
      where: (table, { inArray, and, eq }) =>
        and(eq(table.workspaceId, message.workspaceId), inArray(table.name, message.roles!)),
    });
    const missingRoles = message.roles.filter((name) => !found.some((role) => role.name === name));
    if (missingRoles.length > 0) {
      return Err(
        new MigrationError({
          message: `Roles ${JSON.stringify(missingRoles)} are missing, please create them first`,
        }),
      );
    }
    for (const role of found) {
      roles[role.name] = role.id;
    }
  }
  // name -> id
  const permissions: Record<string, string> = {};

  if (message.permissions && message.permissions.length > 0) {
    const found = await db.query.permissions.findMany({
      where: (table, { inArray, and, eq }) =>
        and(eq(table.workspaceId, message.workspaceId), inArray(table.name, message.permissions!)),
    });
    const missingRoles = message.permissions.filter(
      (name) => !found.some((permission) => permission.name === name),
    );
    if (missingRoles.length > 0) {
      return Err(
        new MigrationError({
          message: `Roles ${JSON.stringify(missingRoles)} are missing, please create them first`,
        }),
      );
    }
    for (const permission of found) {
      permissions[permission.name] = permission.id;
    }
  }
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.keys).values({
        id: keyId,
        workspaceId: message.workspaceId,
        keyAuthId: message.keyAuthId,
        hash: message.hash,
        start: message.start ?? "",
        ownerId: message.ownerId,
        meta: message.meta ? JSON.stringify(message.meta) : null,
        createdAtM: Date.now(),
        expires: message.expires ? new Date(message.expires) : null,
        refillAmount: message.refill?.amount,
        refillDay: message.refill?.refillDay,
        enabled: message.enabled,
        remaining: message.remaining,
        ratelimitAsync: message.ratelimit?.async,
        ratelimitLimit: message.ratelimit?.limit,
        ratelimitDuration: message.ratelimit?.duration,
        environment: message.environment,
      });

      if (message.encrypted) {
        await tx.insert(schema.encryptedKeys).values({
          workspaceId: message.workspaceId,
          keyId: keyId,
          encrypted: message.encrypted.encrypted,
          encryptionKeyId: message.encrypted.keyId,
        });
      }

      /**
       * ROLES
       */

      if (Object.keys(roles).length > 0) {
        const roleConnections = Object.values(roles).map((roleId) => ({
          keyId,
          roleId,
          workspaceId: message.workspaceId,
          createdAtM: Date.now(),
        }));

        await tx.insert(schema.keysRoles).values(roleConnections);
      }

      /**
       * PERMISSIONS
       */

      if (Object.keys(permissions).length > 0) {
        const permissionConnections = Object.values(permissions).map((permissionId) => ({
          keyId,
          permissionId,
          workspaceId: message.workspaceId,
          createdAtM: Date.now(),
        }));

        await tx.insert(schema.keysPermissions).values(permissionConnections);
      }
    });
  } catch (e) {
    const err = e as Error;
    return Err(
      new MigrationError({
        message: err.message,
      }),
    );
  }
  return Ok();
}
