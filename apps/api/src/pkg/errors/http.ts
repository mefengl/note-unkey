/**
 * HTTP错误处理系统
 * 
 * 想象你在处理客户服务请求：
 * - 客户填错了表格（400 Bad Request）
 * - 客户没有会员卡（401 Unauthorized）
 * - 客户想进入员工专用区（403 Forbidden）
 * - 客户要找的商品不存在（404 Not Found）
 * - 系统发生了故障（500 Internal Error）
 * 
 * 这个模块定义了API服务可能返回的所有错误类型
 */

import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { StatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";
import type { HonoEnv } from "../hono/env";
import { parseZodErrorMessage } from "../util/zod-error";

/**
 * API错误代码枚举
 * 定义所有可能的错误类型
 */
const ErrorCode = z.enum([
  "BAD_REQUEST",           // 请求格式错误
  "FORBIDDEN",            // 没有权限
  "INTERNAL_SERVER_ERROR", // 服务器内部错误
  "USAGE_EXCEEDED",       // 使用超限
  "DISABLED",            // 功能已禁用
  "NOT_FOUND",           // 资源不存在
  "CONFLICT",            // 资源冲突
  "RATE_LIMITED",        // 请求过于频繁
  "UNAUTHORIZED",        // 未授权
  "PRECONDITION_FAILED", // 前置条件不满足
  "INSUFFICIENT_PERMISSIONS", // 权限不足
  "METHOD_NOT_ALLOWED",  // 方法不允许
  "EXPIRED",            // 已过期
  "DELETE_PROTECTED",    // 受保护无法删除
]);

/**
 * 创建错误响应模式
 * 根据错误代码生成标准的错误响应格式
 * 
 * @example
 * const BadRequestSchema = errorSchemaFactory(z.enum(["BAD_REQUEST"]))
 */
export function errorSchemaFactory(code: z.ZodEnum<any>) {
  return z.object({
    error: z.object({
      code: code.openapi({
        description: "机器可读的错误代码",
        example: code._def.values.at(0),
      }),
      docs: z.string().openapi({
        description: "指向详细文档的链接",
        example: `https://unkey.dev/docs/api-reference/errors/code/${code._def.values.at(0)}`,
      }),
      message: z
        .string()
        .openapi({ description: "人类可读的错误说明" }),
      requestId: z.string().openapi({
        description: "用于追踪和调试的请求ID",
        example: "req_1234",
      }),
    }),
  });
}

/**
 * 标准错误响应模式
 * 定义了所有API错误的统一格式
 */
export const ErrorSchema = z.object({
  error: z.object({
    code: ErrorCode.openapi({
      description: "机器可读的错误代码",
      example: "INTERNAL_SERVER_ERROR",
    }),
    docs: z.string().openapi({
      description: "指向详细文档的链接",
      example: "https://unkey.dev/docs/api-reference/errors/code/INTERNAL_SERVER_ERROR",
    }),
    message: z.string().openapi({
      description: "人类可读的错误说明",
      example: "发生了意外错误，请稍后重试",
    }),
    requestId: z.string().openapi({
      description: "用于追踪和调试的请求ID",
      example: "req_abc123",
    }),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorSchema>;

/**
 * 将错误代码转换为HTTP状态码
 * 
 * @param code 错误代码
 * @returns HTTP状态码
 */
function codeToStatus(code: z.infer<typeof ErrorCode>): StatusCode {
  switch (code) {
    case "BAD_REQUEST":
      return 400;
    case "FORBIDDEN":
    case "DISABLED":
    case "UNAUTHORIZED":
    case "INSUFFICIENT_PERMISSIONS":
    case "USAGE_EXCEEDED":
    case "EXPIRED":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "CONFLICT":
      return 409;
    case "DELETE_PROTECTED":
    case "PRECONDITION_FAILED":
      return 412;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL_SERVER_ERROR":
      return 500;
  }
}

/**
 * 将HTTP状态码转换为错误代码
 * 
 * @param status HTTP状态码
 * @returns 错误代码
 */
function statusToCode(status: StatusCode): z.infer<typeof ErrorCode> {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 405:
      return "METHOD_NOT_ALLOWED";
    case 500:
      return "INTERNAL_SERVER_ERROR";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

/**
 * 自定义API错误类
 * 
 * @extends HTTPException
 */
export class UnkeyApiError extends HTTPException {
  public readonly code: z.infer<typeof ErrorCode>;

  constructor({ code, message }: { code: z.infer<typeof ErrorCode>; message: string }) {
    super(codeToStatus(code), { message });
    this.code = code;
  }
}

/**
 * 处理Zod验证错误
 * 
 * @param result Zod验证结果
 * @param c Hono上下文
 * @returns JSON响应
 */
export function handleZodError(
  result:
    | {
        success: true;
        data: any;
      }
    | {
        success: false;
        error: ZodError;
      },
  c: Context,
) {
  if (!result.success) {
    return c.json<z.infer<typeof ErrorSchema>>(
      {
        error: {
          code: "BAD_REQUEST",
          docs: "https://unkey.dev/docs/api-reference/errors/code/BAD_REQUEST",
          message: parseZodErrorMessage(result.error),
          requestId: c.get("requestId"),
        },
      },
      { status: 400 },
    );
  }
}

/**
 * 处理错误
 * 
 * @param err 错误对象
 * @param c Hono上下文
 * @returns JSON响应
 */
export function handleError(err: Error, c: Context<HonoEnv>): Response {
  const { logger } = c.get("services");

  /**
   * 我们可以很好地处理这个错误，因为这是我们自己抛出的
   */
  if (err instanceof UnkeyApiError) {
    if (err.status >= 500) {
      logger.error("returning 5XX", {
        message: err.message,
        name: err.name,
        code: err.code,
        status: err.status,
      });
    }
    return c.json<z.infer<typeof ErrorSchema>>(
      {
        error: {
          code: err.code,
          docs: `https://unkey.dev/docs/api-reference/errors/code/${err.code}`,
          message: err.message,
          requestId: c.get("requestId"),
        },
      },
      { status: err.status },
    );
  }

  /**
   * 来自hono的HTTPExceptions至少给了我们一些处理的线索，因为它们提供了状态和消息
   */
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      logger.error("HTTPException", {
        message: err.message,
        status: err.status,
        requestId: c.get("requestId"),
      });
    }
    const code = statusToCode(err.status);
    return c.json<z.infer<typeof ErrorSchema>>(
      {
        error: {
          code,
          docs: `https://unkey.dev/docs/api-reference/errors/code/${code}`,
          message: err.message,
          requestId: c.get("requestId"),
        },
      },
      { status: err.status },
    );
  }

  /**
   * 我们在这里迷失了，只能返回500并记录日志以供调查
   */
  logger.error("unhandled exception", {
    name: err.name,
    message: err.message,
    cause: err.cause,
    stack: err.stack,
    requestId: c.get("requestId"),
  });
  return c.json<z.infer<typeof ErrorSchema>>(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        docs: "https://unkey.dev/docs/api-reference/errors/code/INTERNAL_SERVER_ERROR",
        message: err.message ?? "something unexpected happened",
        requestId: c.get("requestId"),
      },
    },
    { status: 500 },
  );
}

/**
 * 返回错误响应
 * 
 * @param c Hono上下文
 * @param code 错误代码
 * @param message 错误消息
 * @returns JSON响应
 */
export function errorResponse(c: Context, code: z.infer<typeof ErrorCode>, message: string) {
  return c.json<z.infer<typeof ErrorSchema>>(
    {
      error: {
        code: code,
        docs: `https://unkey.dev/docs/api-reference/errors/code/${code}`,
        message,
        requestId: c.get("requestId"),
      },
    },
    { status: codeToStatus(code) },
  );
}
