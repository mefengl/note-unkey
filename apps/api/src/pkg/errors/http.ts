/**
 * HTTP错误处理模块
 * 
 * 负责:
 * 1. 将业务错误转换为标准的HTTP响应
 * 2. 统一错误格式
 * 3. 提供错误追踪能力
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
  "BAD_REQUEST",           // 请求格式错误（例：缺少必需参数）
  "FORBIDDEN",            // 没有权限（例：普通用户访问管理功能）
  "INTERNAL_SERVER_ERROR", // 服务器内部错误（例：数据库崩溃）
  "USAGE_EXCEEDED",       // 使用超限（例：API调用次数超限）
  "DISABLED",            // 功能已禁用（例：系统维护中）
  "NOT_FOUND",           // 资源不存在（例：访问已删除的数据）
  "CONFLICT",            // 资源冲突（例：创建重名用户）
  "RATE_LIMITED",        // 请求过于频繁（例：每秒请求次数过多）
  "UNAUTHORIZED",        // 未授权（例：未登录）
  "PRECONDITION_FAILED", // 前置条件不满足（例：版本号不匹配）
  "INSUFFICIENT_PERMISSIONS", // 权限不足（例：无法执行高级操作）
  "METHOD_NOT_ALLOWED",  // 方法不允许（例：对只读资源发送POST）
  "EXPIRED",            // 已过期（例：token过期）
  "DELETE_PROTECTED",    // 受保护无法删除（例：系统关键数据）
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
 * 错误响应格式
 * 定义API错误的标准返回格式
 */
export const ErrorSchema = z.object({
  error: z.object({
    code: ErrorCode.openapi({
      description: "机器可读的错误代码",
      example: "BAD_REQUEST",
    }),
    docs: z.string().openapi({
      description: "指向详细文档的链接",
      example: "https://unkey.dev/docs/api-reference/errors/code/BAD_REQUEST",
    }),
    message: z.string().openapi({
      description: "人类可读的错误说明",
      example: "名称字段不能为空",
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
 * 
 * @example
 * codeToStatus("NOT_FOUND") => 404
 * codeToStatus("INTERNAL_SERVER_ERROR") => 500
 */
function codeToStatus(code: z.infer<typeof ErrorCode>): StatusCode {
  switch (code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
    case "INSUFFICIENT_PERMISSIONS":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "CONFLICT":
      return 409;
    case "PRECONDITION_FAILED":
    case "DELETE_PROTECTED":
      return 412;
    case "RATE_LIMITED":
      return 429;
    case "USAGE_EXCEEDED":
      return 429;
    case "INTERNAL_SERVER_ERROR":
    case "DISABLED":
    case "EXPIRED":
      return 500;
  }
}

/**
 * HTTP状态码到错误代码的映射
 * 确保API返回一致的错误格式
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
    case 409:
      return "CONFLICT";
    case 412:
      return "PRECONDITION_FAILED";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

/**
 * API错误基类
 * 所有自定义API错误都应该继承这个类
 */
export class UnkeyApiError extends HTTPException {
  public readonly code: z.infer<typeof ErrorCode>;

  constructor(opts: {
    code: z.infer<typeof ErrorCode>;
    message: string;
    cause?: Error;
  }) {
    super(codeToStatus(opts.code), {
      message: opts.message,
      cause: opts.cause,
    });
    this.code = opts.code;
  }
}

/**
 * Zod验证错误处理器
 * 将Zod的错误信息转换为标准API响应格式
 * 
 * @param result - Zod验证结果
 * @param c - Hono上下文
 * @returns 格式化的错误响应
 * 
 * @example
 * const result = userSchema.safeParse(data);
 * if (!result.success) {
 *   return handleZodError(result, c);
 * }
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
 * 统一错误处理函数
 * 处理API中可能出现的各种错误，转换成标准格式
 * 
 * @param err 错误对象
 * @param c Hono上下文
 * @returns JSON错误响应
 */
export function handleError(err: Error, c: Context<HonoEnv>): Response {
  const { logger } = c.get("services");

  // 处理已知的API错误
  if (err instanceof UnkeyApiError) {
    if (err.status >= 500) {
      logger.error("返回5XX错误", {
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

  // 处理Hono框架的HTTP错误
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      logger.error("Hono HTTP异常", {
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

  // 处理未预期的错误
  logger.error("未处理的异常", {
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
        message: err.message ?? "发生了意外的错误",
        requestId: c.get("requestId"),
      },
    },
    { status: 500 },
  );
}

/**
 * 创建标准的错误响应
 * 
 * @param c Hono上下文
 * @param code 错误代码
 * @param message 错误消息
 * @returns JSON错误响应
 * 
 * @example
 * return errorResponse(c, "NOT_FOUND", "找不到指定的用户")
 */
export function errorResponse(
  c: Context,
  code: z.infer<typeof ErrorCode>,
  message: string,
) {
  return c.json<z.infer<typeof ErrorSchema>>(
    {
      error: {
        code,
        docs: `https://unkey.dev/docs/api-reference/errors/code/${code}`,
        message,
        requestId: c.get("requestId"),
      },
    },
    { status: codeToStatus(code) },
  );
}
