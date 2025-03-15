/**
 * @fileoverview API密钥创建实现
 * 
 * 该文件实现了Unkey系统中创建API密钥的核心功能。
 * 它支持多种密钥配置选项，包括：
 * 1. 基本配置（前缀、名称、长度等）
 * 2. 权限控制（角色和权限）
 * 3. 使用限制（过期时间、使用次数）
 * 4. 速率限制
 * 5. 自动补充策略
 * 6. 密钥恢复功能
 */

import { type UnkeyAuditLog, insertUnkeyAuditLog } from "@/pkg/audit";
import { rootKeyAuth } from "@/pkg/auth/root_key";
import type { Database, Identity } from "@/pkg/db";
import { UnkeyApiError, openApiErrorResponses } from "@/pkg/errors";
import type { App } from "@/pkg/hono/app";
import { retry } from "@/pkg/util/retry";
import { revalidateKeyCount } from "@/pkg/util/revalidate_key_count";
import { createRoute, z } from "@hono/zod-openapi";
import { schema } from "@unkey/db";
import { sha256 } from "@unkey/hash";
import { newId } from "@unkey/id";
import { KeyV1 } from "@unkey/keys";
import { buildUnkeyQuery } from "@unkey/rbac";

/**
 * API路由定义
 * 使用OpenAPI规范描述接口的请求和响应格式
 */
const route = createRoute({
  tags: ["keys"],
  operationId: "createKey",
  method: "post" as const,
  path: "/v1/keys.createKey",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            // API ID，指定密钥所属的API
            apiId: z.string().openapi({
              description: "Choose an `API` where this key should be created.",
              example: "api_123",
            }),

            // 密钥前缀，用于标识密钥的用途或来源
            prefix: z
              .string()
              .max(16)
              .optional()
              .openapi({
                description: `自定义密钥前缀，帮助用户识别密钥来源。
例如：Stripe使用sk_live_作为生产环境密钥前缀。
如果设置了prefix，系统会自动添加下划线，如"abc"会生成"abc_xxxxxxxxx"格式的密钥。`,
              }),

            // 密钥名称，仅供内部使用
            name: z.string().optional().openapi({
              description: "密钥名称，仅供内部使用，不会展示给最终用户。",
              example: "my key",
            }),

            // 密钥字节长度，影响密钥的安全性和长度
            byteLength: z.number().int().min(16).max(255).default(16).optional().openapi({
              description: `密钥生成的字节长度，决定了密钥的熵值和长度。
越长越安全，但也更难处理。默认16字节（2^128种可能组合）。`,
              default: 16,
            }),

            // 用户ID，已废弃
            ownerId: z.string().optional().openapi({
              deprecated: true,
              description: "已废弃，请使用externalId",
              example: "team_123",
            }),

            // 外部ID，用于关联到你的用户系统
            externalId: z
              .string()
              .optional()
              .openapi({
                description: `关联到你系统中的用户ID。
在验证密钥时会返回此ID，方便你识别密钥属于哪个用户。`,
                example: "team_123",
              }),

            // 元数据，可存储任意额外信息
            meta: z
              .record(z.unknown())
              .optional()
              .openapi({
                description: "可以存储任何对你有用的动态元数据",
                example: {
                  billingTier: "PRO",
                  trialEnds: "2023-06-16T17:16:37.161Z",
                },
              }),

            // 角色列表
            roles: z
              .array(z.string().min(1).max(512))
              .optional()
              .openapi({
                description: "分配给密钥的角色列表。如果角色不存在会抛出错误。",
                example: ["admin", "finance"],
              }),

            // 权限列表
            permissions: z
              .array(z.string().min(1).max(512))
              .optional()
              .openapi({
                description: "分配给密钥的权限列表。如果权限不存在会抛出错误。",
                example: ["domains.create_record", "say_hello"],
              }),

            // 过期时间
            expires: z.number().int().optional().openapi({
              description: `密钥的过期时间（毫秒时间戳）。
过期后密钥会自动禁用，除非手动重新启用否则无法使用。`,
              example: 1623869797161,
            }),

            // 剩余使用次数
            remaining: z
              .number()
              .int()
              .optional()
              .openapi({
                description: `限制密钥可以使用的次数。
当剩余次数为0时，密钥会自动禁用，除非更新否则无法继续使用。`,
                example: 1000,
                externalDocs: {
                  description: "了解更多",
                  url: "https://unkey.dev/docs/features/remaining",
                },
              }),

            // 自动补充配置
            refill: z
              .object({
                // 补充间隔
                interval: z.enum(["daily", "monthly"]).openapi({
                  description: "设置自动补充使用次数的间隔：每日或每月",
                }),
                // 补充数量
                amount: z.number().int().min(1).positive().openapi({
                  description: "每次补充的使用次数",
                }),
                // 补充日期（按月时可用）
                refillDay: z
                  .number()
                  .min(1)
                  .max(31)
                  .optional()
                  .openapi({
                    description: `每月补充的具体日期。例如设置15表示每月15日补充。
如果该日期在当月不存在（如2月30日），会在月末补充。`,
                  }),
              })
              .optional()
              .openapi({
                description: "设置定期自动补充使用次数的规则",
                example: {
                  interval: "monthly",
                  amount: 100,
                  refillDay: 15,
                },
              }),

            // 速率限制配置
            ratelimit: z
              .object({
                // 异步处理标志
                async: z
                  .boolean()
                  .default(true)
                  .optional()
                  .openapi({
                    description: `异步模式下会立即返回响应，降低延迟但牺牲一些准确性。
此配置即将变为必选项。`,
                    externalDocs: {
                      description: "了解更多",
                      url: "https://unkey.dev/docs/features/ratelimiting",
                    },
                  }),
                // 限制类型（已废弃）
                type: z
                  .enum(["fast", "consistent"])
                  .default("fast")
                  .optional()
                  .openapi({
                    description: "已废弃，请使用async参数。fast模式无延迟但准确性较低，consistent模式相反。",
                    externalDocs: {
                      description: "了解更多",
                      url: "https://unkey.dev/docs/features/ratelimiting",
                    },
                    deprecated: true,
                  }),
                // 限制次数
                limit: z.number().int().min(1).openapi({
                  description: "在给定时间窗口内允许的请求总数",
                }),
                // 时间窗口
                duration: z.number().int().min(1000).optional().openapi({
                  description: "时间窗口的长度（毫秒），此配置即将变为必选项",
                  example: 60_000,
                }),
                // 补充速率（已废弃）
                refillRate: z.number().int().min(1).optional().openapi({
                  description: "每个补充间隔添加的令牌数量",
                  deprecated: true,
                }),
                // 补充间隔（已废弃）
                refillInterval: z.number().int().min(1).optional().openapi({
                  description: "补充间隔（毫秒）",
                  deprecated: true,
                }),
              })
              .optional()
              .openapi({
                description: "内置的固定窗口速率限制配置",
                example: {
                  type: "fast",
                  limit: 10,
                  duration: 60_000,
                },
              }),

            // 启用状态
            enabled: z.boolean().default(true).optional().openapi({
              description: "设置密钥是否启用。禁用的密钥无法通过验证。",
              example: false,
            }),

            // 可恢复性
            recoverable: z
              .boolean()
              .default(false)
              .optional()
              .openapi({
                description: `设置密钥是否可以恢复显示。
虽然我们不推荐这样做，但为了灵活性保留了这个选项。
可恢复的密钥除了存储哈希值外，还会将原文加密存储在vault中，
这样之后可以检索并显示原始密钥。
详见 https://www.unkey.com/docs/security/recovering-keys`,
              }),

            // 环境标识
            environment: z
              .string()
              .max(256)
              .optional()
              .openapi({
                description: `用于区分不同环境的密钥。
类似Stripe、Clerk等服务都有"live"和"test"环境的概念，
可以让开发者安全地开发应用而不影响生产环境。
验证密钥时会返回此环境标识，方便你做相应处理。`,
              }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "密钥创建成功响应",
      content: {
        "application/json": {
          schema: z.object({
            keyId: z.string().openapi({
              description: "密钥ID，用于后续管理操作（如更新、删除等）。这不是机密信息，可以存储。",
              example: "key_123",
            }),
            key: z.string().openapi({
              description: "新创建的API密钥。不要在你的系统中存储，而是直接传给你的用户。",
              example: "prefix_xxxxxxxxx",
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
export type V1KeysCreateKeyRequest = z.infer<
  (typeof route.request.body.content)["application/json"]["schema"]
>;
export type V1KeysCreateKeyResponse = z.infer<
  (typeof route.responses)[200]["content"]["application/json"]["schema"]
>;

/**
 * API处理函数注册
 * 实现密钥创建的核心逻辑
 */
export const registerV1KeysCreateKey = (app: App) =>
  app.openapi(route, async (c) => {
    // 1. 请求参数验证
    const req = c.req.valid("json");
    const { cache, db, logger, vault, rbac } = c.get("services");
    
    // 2. Root Key认证
    const auth = await rootKeyAuth(
      c,
      buildUnkeyQuery(({ or }) => or("*", "api.*.create_key", `api.${req.apiId}.create_key`)),
    );

    // 3. 加载API配置
    const { val: api, err } = await cache.apiById.swr(req.apiId, async () => {
      return (
        (await db.readonly.query.apis.findFirst({
          where: (table, { eq, and, isNull }) =>
            and(eq(table.id, req.apiId), isNull(table.deletedAtM)),
          with: {
            keyAuth: true,
          },
        })) ?? null
      );
    });

    // 4. 错误处理
    if (err) {
      throw new UnkeyApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: `unable to load api: ${err.message}`,
      });
    }
    if (!api || api.workspaceId !== auth.authorizedWorkspaceId) {
      throw new UnkeyApiError({
        code: "NOT_FOUND",
        message: `api ${req.apiId} not found`,
      });
    }
    if (!api.keyAuth) {
      throw new UnkeyApiError({
        code: "PRECONDITION_FAILED",
        message: `api ${req.apiId} is not setup to handle keys`,
      });
    }

    // 5. 参数验证
    if (req.recoverable && !api.keyAuth.storeEncryptedKeys) {
      throw new UnkeyApiError({
        code: "PRECONDITION_FAILED",
        message: `api ${req.apiId} does not support recoverable keys`,
      });
    }
    if (req.remaining === 0) {
      throw new UnkeyApiError({
        code: "BAD_REQUEST",
        message: "remaining must be greater than 0.",
      });
    }
    if ((req.remaining === null || req.remaining === undefined) && req.refill?.interval) {
      throw new UnkeyApiError({
        code: "BAD_REQUEST",
        message: "remaining must be set if you are using refill.",
      });
    }
    if (req.refill?.refillDay && req.refill.interval === "daily") {
      throw new UnkeyApiError({
        code: "BAD_REQUEST",
        message: "when interval is set to 'daily', 'refillDay' must be null.",
      });
    }

    // 6. 准备创建密钥
    const authorizedWorkspaceId = auth.authorizedWorkspaceId;
    const rootKeyId = auth.key.id;
    const externalId = req.externalId ?? req.ownerId;
    
    // 7. 并行处理权限、角色和身份
    const [permissionIds, roleIds, identity] = await Promise.all([
      getPermissionIds(db.readonly, authorizedWorkspaceId, req.permissions ?? []),
      getRoleIds(db.readonly, authorizedWorkspaceId, req.roles ?? []),
      externalId
        ? upsertIdentity(db.primary, authorizedWorkspaceId, externalId)
        : Promise.resolve(null),
    ]);

    // 8. 生成新密钥（带重试机制）
    const newKey = await retry(5, async (attempt) => {
      if (attempt > 1) {
        logger.warn("retrying key creation", {
          attempt,
          workspaceId: authorizedWorkspaceId,
          apiId: api.id,
        });
      }

      // 8.1 生成密钥
      const secret = new KeyV1({
        byteLength: req.byteLength ?? api.keyAuth?.defaultBytes ?? 16,
        prefix: req.prefix ?? (api.keyAuth?.defaultPrefix as string | undefined),
      }).toString();
      const start = secret.slice(0, (req.prefix?.length ?? 0) + 5);
      const kId = newId("key");
      const hash = await sha256(secret.toString());

      // 8.2 存储密钥信息
      await db.primary.insert(schema.keys).values({
        id: kId,
        keyAuthId: api.keyAuthId!,
        name: req.name,
        hash,
        start,
        ownerId: externalId,
        meta: req.meta ? JSON.stringify(req.meta) : null,
        workspaceId: authorizedWorkspaceId,
        forWorkspaceId: null,
        expires: req.expires ? new Date(req.expires) : null,
        createdAtM: Date.now(),
        updatedAtM: null,
        ratelimitAsync: req.ratelimit?.async ?? req.ratelimit?.type === "fast",
        ratelimitLimit: req.ratelimit?.limit ?? req.ratelimit?.refillRate,
        ratelimitDuration: req.ratelimit?.duration ?? req.ratelimit?.refillInterval,
        remaining: req.remaining,
        refillDay: req.refill?.interval === "daily" ? null : req?.refill?.refillDay ?? 1,
        refillAmount: req.refill?.amount,
        lastRefillAt: req.refill?.interval ? new Date() : null,
        enabled: req.enabled,
        environment: req.environment ?? null,
        identityId: identity?.id,
      });

      // 8.3 处理可恢复密钥
      if (req.recoverable && api.keyAuth?.storeEncryptedKeys) {
        const perm = rbac.evaluatePermissions(
          buildUnkeyQuery(({ or }) => or("*", "api.*.encrypt_key", `api.${api.id}.encrypt_key`)),
          auth.permissions,
        );
        if (perm.err) {
          throw new UnkeyApiError({
            code: "INTERNAL_SERVER_ERROR",
            message: `unable to evaluate permissions: ${perm.err.message}`,
          });
        }
        if (!perm.val.valid) {
          throw new UnkeyApiError({
            code: "INSUFFICIENT_PERMISSIONS",
            message: `insufficient permissions to encrypt keys: ${perm.val.message}`,
          });
        }

        // 加密并存储原始密钥
        const vaultRes = await retry(
          3,
          async () => {
            return await vault.encrypt(c, {
              keyring: authorizedWorkspaceId,
              data: secret,
            });
          },
          (attempt, err) =>
            logger.warn("vault.encrypt failed", {
              attempt,
              err: err.message,
            }),
        );
        await db.primary.insert(schema.encryptedKeys).values({
          workspaceId: authorizedWorkspaceId,
          keyId: kId,
          encrypted: vaultRes.encrypted,
          encryptionKeyId: vaultRes.keyId,
        });
      }

      // 8.4 更新密钥计数
      c.executionCtx.waitUntil(revalidateKeyCount(db.primary, api.keyAuthId!));

      return {
        id: kId,
        secret,
      };
    });

    // 9. 关联角色和权限
    await Promise.all([
      roleIds.length > 0
        ? db.primary.insert(schema.keysRoles).values(
            roleIds.map((roleId) => ({
              keyId: newKey.id,
              roleId,
              workspaceId: authorizedWorkspaceId,
            })),
          )
        : Promise.resolve(),
      permissionIds.length > 0
        ? db.primary.insert(schema.keysPermissions).values(
            permissionIds.map((permissionId) => ({
              keyId: newKey.id,
              permissionId,
              workspaceId: authorizedWorkspaceId,
            })),
          )
        : Promise.resolve(),
    ]);

    // 10. 记录审计日志
    const auditLogs: UnkeyAuditLog[] = [
      {
        workspaceId: authorizedWorkspaceId,
        event: "key.create",
        actor: {
          type: "key",
          id: rootKeyId,
        },
        description: `Created ${newKey.id} in ${api.keyAuthId}`,
        resources: [
          {
            type: "key",
            id: newKey.id,
          },
          {
            type: "keyAuth",
            id: api.keyAuthId!,
          },
        ],
        context: {
          location: c.get("location"),
          userAgent: c.get("userAgent"),
        },
      },
      ...roleIds.map(
        (roleId) =>
          ({
            workspaceId: authorizedWorkspaceId,
            actor: { type: "key", id: rootKeyId },
            event: "authorization.connect_role_and_key",
            description: `Connected ${roleId} and ${newKey.id}`,
            resources: [
              {
                type: "key",
                id: newKey.id,
              },
              {
                type: "role",
                id: roleId,
              },
            ],
            context: {
              location: c.get("location"),
              userAgent: c.get("userAgent"),
            },
          }) satisfies UnkeyAuditLog,
      ),
      ...permissionIds.map(
        (permissionId) =>
          ({
            workspaceId: authorizedWorkspaceId,
            actor: { type: "key", id: rootKeyId },
            event: "authorization.connect_permission_and_key",
            description: `Connected ${permissionId} and ${newKey.id}`,
            resources: [
              {
                type: "key",
                id: newKey.id,
              },
              {
                type: "permission",
                id: permissionId,
              },
            ],
            context: {
              location: c.get("location"),
              userAgent: c.get("userAgent"),
            },
          }) satisfies UnkeyAuditLog,
      ),
    ];
    await insertUnkeyAuditLog(c, undefined, auditLogs);

    // 11. 返回结果
    return c.json({
      keyId: newKey.id,
      key: newKey.secret,
    });
  });

/**
 * 获取权限ID列表
 * 根据权限名称列表查找对应的权限ID
 */
async function getPermissionIds(
  db: Database,
  workspaceId: string,
  permissionNames: Array<string>,
): Promise<Array<string>> {
  if (permissionNames.length === 0) {
    return [];
  }
  const permissions = await db.query.permissions.findMany({
    where: (table, { inArray, and, eq }) =>
      and(eq(table.workspaceId, workspaceId), inArray(table.name, permissionNames)),
    columns: {
      id: true,
      name: true,
    },
  });
  if (permissions.length < permissionNames.length) {
    const missingPermissions = permissionNames.filter(
      (name) => !permissions.some((permission) => permission.name === name),
    );
    throw new UnkeyApiError({
      code: "PRECONDITION_FAILED",
      message: `Permissions ${JSON.stringify(
        missingPermissions,
      )} are missing, please create them first`,
    });
  }
  return permissions.map((r) => r.id);
}

/**
 * 获取角色ID列表
 * 根据角色名称列表查找对应的角色ID
 */
async function getRoleIds(
  db: Database,
  workspaceId: string,
  roleNames: Array<string>,
): Promise<Array<string>> {
  if (roleNames.length === 0) {
    return [];
  }
  const roles = await db.query.roles.findMany({
    where: (table, { inArray, and, eq }) =>
      and(eq(table.workspaceId, workspaceId), inArray(table.name, roleNames)),
    columns: {
      id: true,
      name: true,
    },
  });
  if (roles.length < roleNames.length) {
    const missingRoles = roleNames.filter((name) => !roles.some((role) => role.name === name));
    throw new UnkeyApiError({
      code: "PRECONDITION_FAILED",
      message: `Roles ${JSON.stringify(missingRoles)} are missing, please create them first`,
    });
  }
  return roles.map((r) => r.id);
}

/**
 * 创建或更新身份信息
 * 根据外部ID关联用户身份
 */
export async function upsertIdentity(
  db: Database,
  workspaceId: string,
  externalId: string,
): Promise<Identity> {
  // 1. 查找现有身份
  let identity = await db.query.identities.findFirst({
    where: (table, { and, eq }) =>
      and(eq(table.workspaceId, workspaceId), eq(table.externalId, externalId)),
  });

  // 2. 如果存在则直接返回
  if (identity) {
    return identity;
  }

  // 3. 不存在则创建新身份
  await db
    .insert(schema.identities)
    .values({
      id: newId("identity"),
      createdAt: Date.now(),
      updatedAt: null,
      environment: "default",
      meta: {},
      externalId,
      workspaceId,
    })
    .onDuplicateKeyUpdate({
      set: {
        updatedAt: Date.now(),
      },
    });

  // 4. 获取新创建的身份
  identity = await db.query.identities.findFirst({
    where: (table, { and, eq }) =>
      and(eq(table.workspaceId, workspaceId), eq(table.externalId, externalId)),
  });

  if (!identity) {
    throw new UnkeyApiError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to read identity after upsert",
    });
  }

  return identity;
}
