/**
 * 速率限制API实现
 * 
 * 该文件实现了Unkey的核心速率限制API端点。
 * 主要功能：
 * 1. 接收和验证限流请求
 * 2. 处理命名空间管理
 * 3. 执行权限检查
 * 4. 应用限流规则
 * 5. 记录审计日志
 */

import type { App } from "@/pkg/hono/app";
import { createRoute, z } from "@hono/zod-openapi";
import { insertGenericAuditLogs, insertUnkeyAuditLog } from "@/pkg/audit";
import { rootKeyAuth } from "@/pkg/auth/root_key";
import { UnkeyApiError, openApiErrorResponses } from "@/pkg/errors";
import { match } from "@/pkg/util/wildcard";
import { DatabaseError } from "@planetscale/database";
import { type InsertRatelimitNamespace, schema } from "@unkey/db";
import { newId } from "@unkey/id";
import { buildUnkeyQuery } from "@unkey/rbac";

/**
 * API路由配置
 * 
 * 定义了限流API的:
 * - 路径: /v1/ratelimits.limit
 * - 方法: POST
 * - 安全性: Bearer Token认证
 * - 请求/响应模式
 */
const route = createRoute({
  tags: ["ratelimits"],
  operationId: "limit",
  method: "post",
  path: "/v1/ratelimits.limit",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            /**
             * 命名空间配置
             * 用于对不同类型的限流进行分组，便于分析和管理
             * 例如：可以为公共API和内部tRPC路由创建不同的命名空间
             */
            namespace: z.string().optional().default("default").openapi({
              description:
                "Namespaces group different limits together for better analytics. You might have a namespace for your public API and one for internal tRPC routes.",
              example: "email.outbound",
            }),

            /**
             * 限流标识符
             * 可以是：
             * - 用户ID
             * - 邮箱地址
             * - IP地址
             * - 其他唯一标识
             */
            identifier: z.string().openapi({
              description:
                "Identifier of your user, this can be their userId, an email, an ip or anything else.",
              example: "user_123",
            }),

            /**
             * 限流阈值
             * 定义在给定时间窗口内允许的请求数量
             */
            limit: z.number().int().positive().openapi({
              description: "How many requests may pass in a given window.",
              example: 10,
            }),

            /**
             * 时间窗口
             * 以毫秒为单位的窗口持续时间
             * 最小值1000ms(1秒)
             */
            duration: z.number().int().min(1000).openapi({
              description: "The window duration in milliseconds",
              example: 60_000,
            }),

            /**
             * 请求成本
             * 针对不同开销的请求可以设置不同的成本：
             * - 默认值：1
             * - 0：只检查当前限制而不扣减配额
             * - >1：扣减多个配额单位
             */
            cost: z
              .number()
              .int()
              .min(0)
              .default(1)
              .optional()
              .openapi({
                description: `Expensive requests may use up more tokens. You can specify a cost to the request here and we'll deduct this many tokens in the current window.
If there are not enough tokens left, the request is denied.
Set it to 0 to receive the current limit without changing anything.`,
                example: 2,
                default: 1,
              }),

            /**
             * 异步处理标志
             * - true：立即返回响应，降低延迟但可能影响准确性
             * - false：同步处理，确保准确性但延迟较高
             */
            async: z.boolean().default(false).optional().openapi({
              description:
                "Async will return a response immediately, lowering latency at the cost of accuracy.",
            }),

            /**
             * 元数据
             * 可以附加任意键值对信息用于:
             * - 请求追踪
             * - 自定义标记
             * - 业务数据关联
             */
            meta: z
              .record(z.union([z.string(), z.boolean(), z.number(), z.null()]))
              .optional()
              .openapi({
                description: "Attach any metadata to this request",
              }),

            /**
             * 资源信息
             * 用于记录本次限流涉及的资源：
             * - 类型：如organization、project等
             * - ID：资源唯一标识
             * - 名称：人类可读的资源名称
             * - 元数据：资源相关的额外信息
             */
            resources: z
              .array(
                z.object({
                  type: z.string().openapi({
                    description: "The type of resource",
                    example: "organization",
                  }),
                  id: z.string().openapi({
                    description: "The unique identifier for the resource",
                    example: "org_123",
                  }),
                  name: z.string().optional().openapi({
                    description: "A human readable name for this resource",
                    example: "unkey",
                  }),
                  meta: z
                    .record(z.union([z.string(), z.boolean(), z.number(), z.null()]))
                    .optional()
                    .openapi({
                      description: "Attach any metadata to this resources",
                    }),
                }),
              )
              .optional()
              .openapi({
                description: "Resources that are about to be accessed by the user",
                example: [
                  {
                    type: "project",
                    id: "p_123",
                    name: "dub",
                  },
                ],
              }),
          }),
        },
      },
    },
  },

  /**
   * API响应定义
   * 
   * 成功响应(200)包含：
   * - success: 是否允许请求通过
   * - limit: 限制阈值
   * - remaining: 剩余可用配额
   * - reset: 重置时间戳
   */
  responses: {
    200: {
      description: "",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean().openapi({
              description:
                "Returns true if the request should be processed, false if it was rejected.",
              example: true,
            }),
            limit: z.number().int().openapi({
              description: "How many requests are allowed within a window.",
              example: 10,
            }),
            remaining: z.number().int().openapi({
              description: "How many requests can still be made in the current window.",
              example: 9,
            }),
            reset: z.number().int().openapi({
              description: "A unix millisecond timestamp when the limits reset.",
              example: 1709804263654,
            }),
          }),
        },
      },
    },
    ...openApiErrorResponses,
  },
});

export type Route = typeof route;
export type V1RatelimitLimitRequest = z.infer<
  (typeof route.request.body.content)["application/json"]["schema"]
>;
export type V1RatelimitLimitResponse = z.infer<
  (typeof route.responses)[200]["content"]["application/json"]["schema"]
>;

/**
 * 速率限制处理函数
 * 
 * 主要处理流程：
 * 1. 验证请求参数
 * 2. 获取根密钥和权限信息
 * 3. 查找或创建命名空间
 * 4. 检查覆盖规则
 * 5. 执行限流判断
 * 6. 记录分析数据
 * 7. 生成审计日志
 */
export const registerV1RatelimitLimit = (app: App) =>
  app.openapi(route, async (c) => {
    const req = c.req.valid("json");
    const { cache, db, rateLimiter, analytics, rbac, logger } = c.get("services");
    const rootKey = await rootKeyAuth(c);

    /**
     * 缓存层处理
     * 
     * 使用SWR(Stale-While-Revalidate)策略：
     * 1. 优先返回缓存数据(如果有)
     * 2. 后台异步更新缓存
     * 3. 提升响应速度同时保持数据新鲜
     */
    const { val, err } = await cache.ratelimitByIdentifier.swr(
      [rootKey.authorizedWorkspaceId, req.namespace, req.identifier].join("::"),
      async () => {
        /**
         * 数据库查询
         * 查找命名空间及其覆盖规则：
         * 1. 精确匹配工作区ID
         * 2. 精确匹配命名空间名称
         * 3. 确保命名空间未被删除
         */
        const dbRes = await db.readonly.query.ratelimitNamespaces.findFirst({
          where: (table, { eq, and, isNull }) =>
            and(
              eq(table.workspaceId, rootKey.authorizedWorkspaceId),
              eq(table.name, req.namespace),
              isNull(table.deletedAtM),
            ),
          columns: {
            id: true,
            workspaceId: true,
          },
          with: {
            overrides: {
              columns: {
                identifier: true,
                async: true,
                limit: true,
                duration: true,
                sharding: true,
              },
            },
          },
        });

        /**
         * 命名空间自动创建
         * 
         * 如果命名空间不存在：
         * 1. 检查是否有创建权限
         * 2. 生成新的命名空间ID
         * 3. 插入数据库记录
         * 4. 创建审计日志
         */
        if (!dbRes) {
          const canCreateNamespace = rbac.evaluatePermissions(
            buildUnkeyQuery(({ or }) => or("*", "ratelimit.*.create_namespace")),
            rootKey.permissions ?? [],
          );
          if (canCreateNamespace.err || !canCreateNamespace.val.valid) {
            return null;
          }

          let namespace: InsertRatelimitNamespace = {
            id: newId("ratelimitNamespace"),
            createdAtM: Date.now(),
            name: req.namespace,
            deletedAtM: null,
            updatedAtM: null,
            workspaceId: rootKey.authorizedWorkspaceId,
          };

          try {
            await db.primary.insert(schema.ratelimitNamespaces).values(namespace);
            await insertUnkeyAuditLog(c, undefined, {
              workspaceId: rootKey.authorizedWorkspaceId,
              actor: {
                type: "key",
                id: rootKey.key.id,
              },
              event: "ratelimitNamespace.create",
              description: `Created ${namespace.id}`,
              resources: [
                {
                  type: "ratelimitNamespace",
                  id: namespace.id,
                },
              ],
              context: {
                location: c.get("location"),
                userAgent: c.get("userAgent"),
              },
            });
          } catch (e) {
            if (e instanceof DatabaseError && e.body.message.includes("desc = Duplicate entry")) {
              /**
               * 处理并发创建
               * 如果在我们检查和创建之间其他请求已创建了命名空间：
               * 1. 捕获重复键错误
               * 2. 重新查询获取已存在的命名空间
               */
              namespace = (await db.readonly.query.ratelimitNamespaces.findFirst({
                where: (table, { eq, and }) =>
                  and(
                    eq(table.name, req.namespace),
                    eq(table.workspaceId, rootKey.authorizedWorkspaceId),
                  ),
              }))!;
            } else {
              throw e;
            }
          }
          return {
            namespace,
          };
        }

        /**
         * 覆盖规则匹配
         * 
         * 按优先级依次尝试：
         * 1. 精确标识符匹配
         * 2. 通配符模式匹配
         * 3. 使用默认配置
         */
        const exactMatch = dbRes.overrides.find((o) => o.identifier === req.identifier);
        if (exactMatch) {
          return {
            namespace: dbRes,
            override: exactMatch,
          };
        }

        const wildcardMatch = dbRes.overrides.find((o) => {
          if (!o.identifier.includes("*")) {
            return false;
          }
          return match(o.identifier, req.identifier);
        });
        if (wildcardMatch) {
          return {
            namespace: dbRes,
            override: wildcardMatch,
          };
        }

        return {
          namespace: dbRes,
          override: undefined,
        };
      },
    );

    /**
     * 错误处理与权限验证
     */
    if (err) {
      throw new UnkeyApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: `unable to load ratelimit: ${err.message}`,
      });
    }
    if (!val || val.namespace.workspaceId !== rootKey.authorizedWorkspaceId) {
      throw new UnkeyApiError({
        code: "NOT_FOUND",
        message: `namespace ${req.namespace} not found`,
      });
    }

    const authResult = rbac.evaluatePermissions(
      buildUnkeyQuery(({ or }) =>
        or("*", "ratelimit.*.limit", `ratelimit.${val.namespace.id}.limit`),
      ),
      rootKey.permissions ?? [],
    );
    if (authResult.err) {
      throw new UnkeyApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: authResult.err.message,
      });
    }
    if (!authResult.val.valid) {
      throw new UnkeyApiError({
        code: "INSUFFICIENT_PERMISSIONS",
        message: authResult.val.message,
      });
    }

    /**
     * 应用限流配置
     * 
     * 优先使用覆盖规则中的配置，否则使用请求参数：
     * - limit：限制阈值
     * - duration：时间窗口
     * - async：异步处理
     * - sharding：分片策略
     */
    const { override, namespace } = val;
    const limit = override?.limit ?? req.limit;
    const duration = override?.duration ?? req.duration;
    const async = typeof override?.async !== "undefined" ? override.async : req.async;
    const sharding = override?.sharding;
    const shard =
      sharding === "edge"
        ? // @ts-ignore - this is a bug in the types
          c.req.raw?.cf?.colo
        : "global";

    /**
     * 执行限流检查
     * 
     * 关键参数：
     * - identifier：限流标识符（包含多个维度信息）
     * - interval：时间窗口
     * - limit：限制阈值
     * - cost：请求成本
     * - async：处理模式
     */
    const { val: ratelimitResponse, err: ratelimitError } = await rateLimiter.limit(c, {
      name: "default",
      workspaceId: rootKey.authorizedWorkspaceId,
      namespaceId: namespace.id,
      identifier: [namespace.id, req.identifier, limit, duration, async].join("::"),
      interval: duration,
      limit,
      shard,
      cost: req.cost,
      async: req.async,
    });

    if (ratelimitError) {
      throw new UnkeyApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: ratelimitError.message,
      });
    }

    /**
     * 计算剩余配额
     * 确保不会出现负数
     */
    const remaining = Math.max(0, limit - ratelimitResponse.current);

    /**
     * 异步任务处理
     * 
     * 1. 记录分析数据
     * 使用waitUntil确保在响应返回后继续执行：
     * - 工作区ID
     * - 命名空间ID
     * - 请求ID
     * - 标识符
     * - 时间戳
     * - 是否通过
     */
    c.executionCtx.waitUntil(
      analytics
        .insertRatelimit({
          workspace_id: rootKey.authorizedWorkspaceId,
          namespace_id: namespace.id,
          request_id: c.get("requestId"),
          identifier: req.identifier,
          time: Date.now(),
          passed: ratelimitResponse.passed,
        })
        .then(({ err }) => {
          if (err) {
            logger.error("inserting ratelimit event failed", {
              error: err.message,
            });
          }
        }),
    );

    /**
     * 2. 资源访问审计
     * 如果请求包含资源信息：
     * - 记录访问事件
     * - 包含详细的上下文信息
     * - 关联请求元数据
     */
    if (req.resources && req.resources.length > 0) {
      c.executionCtx.waitUntil(
        insertGenericAuditLogs(c, undefined, {
          auditLogId: newId("auditLog"),
          workspaceId: rootKey.authorizedWorkspaceId,
          bucket: namespace.id,
          actor: {
            type: "key",
            id: rootKey.key.id,
          },
          description: "ratelimit",
          event: ratelimitResponse.passed ? "ratelimit.success" : "ratelimit.denied",
          meta: {
            requestId: c.get("requestId"),
            namespacId: namespace.id,
            identifier: req.identifier,
            success: ratelimitResponse.passed,
          },
          time: Date.now(),
          resources: req.resources ?? [],
          context: {
            location: c.req.header("True-Client-IP") ?? "",
            userAgent: c.req.header("User-Agent") ?? "",
          },
        }),
      );
    }

    /**
     * 返回限流结果
     * 包含：
     * - limit: 限制阈值
     * - remaining: 剩余配额
     * - reset: 重置时间
     * - success: 是否通过
     */
    return c.json({
      limit,
      remaining,
      reset: ratelimitResponse.reset,
      success: ratelimitResponse.passed,
    });
  });
