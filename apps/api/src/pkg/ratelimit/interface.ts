import { BaseError, type Result } from "@unkey/error";
import type { Context } from "hono";
import { z } from "zod";

// 速率限制错误类，用于处理所有速率限制相关的错误
export class RatelimitError extends BaseError {
  // 表示该错误不应该重试
  public readonly retry = false;
  public readonly name = RatelimitError.name;
}

export const ratelimitRequestSchema = z.object({
  name: z.string(),
  workspaceId: z.string(),
  namespaceId: z.string().optional(),
  identifier: z.string(),
  limit: z.number().int(),
  interval: z.number().int(),
  /**
   * Setting cost to 0 should not change anything but return the current limit
   */
  cost: z.number().int().min(0).default(1).optional(),
  /**
   * Add an arbitrary string to the durable object name.
   * We use this to do limiting at the edge for root keys by adding the cloudflare colo
   */
  shard: z.string().optional(),
  async: z.boolean().optional(),
});
export type RatelimitRequest = z.infer<typeof ratelimitRequestSchema>;

export const ratelimitResponseSchema = z.object({
  current: z.number(),
  remaining: z.number(),
  reset: z.number(),
  passed: z.boolean(),
  /**
   * The name of the limit that triggered a rejection
   */
  triggered: z.string().nullable(),
});
export type RatelimitResponse = z.infer<typeof ratelimitResponseSchema>;

// 速率限制器接口定义
export interface RateLimiter {
  // 对单个请求进行速率限制检查
  limit: (c: Context, req: RatelimitRequest) => Promise<Result<RatelimitResponse, RatelimitError>>;
  
  // 对多个请求同时进行速率限制检查
  multiLimit: (
    c: Context,
    req: Array<RatelimitRequest>,
  ) => Promise<Result<RatelimitResponse, RatelimitError>>;
}
