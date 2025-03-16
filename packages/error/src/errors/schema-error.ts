/**
 * Schema验证错误
 * 
 * 想象老师在检查作业格式：
 * - 作业要求写在A4纸上，但学生用了便签纸
 * - 作业要求写姓名和日期，但学生忘记写了
 * - 作业要求用蓝色笔写，但学生用了铅笔
 * 
 * 这类错误表示提交的内容不符合预定的格式要求
 */
import type { ZodError } from "zod";
import { BaseError } from "./base";

/**
 * Schema验证错误类
 * 专门处理数据格式不正确的情况
 */
export class SchemaError extends BaseError<{ raw: unknown }> {
  /**
   * 是否可以重试
   * 格式错误一般不需要重试，需要先修改格式
   */
  public readonly retry = false;
  
  /**
   * 错误类型名称
   */
  public readonly name = SchemaError.name;

  /**
   * 创建一个新的Schema错误
   * @param opts 错误配置
   * - message: 错误描述
   * - context: 错误的具体情况（可选）
   * - cause: 导致这个错误的原因（可选）
   */
  constructor(opts: {
    message: string;
    context?: { raw: unknown };
    cause?: BaseError;
  }) {
    super({
      ...opts,
    });
  }

  /**
   * 从Zod验证错误创建Schema错误
   * 
   * Zod是一个数据验证库，当它发现数据格式问题时会报错
   * 这个方法把Zod的错误转换成我们的Schema错误
   * 
   * @example
   * // 验证用户信息
   * try {
   *   userSchema.parse(data)
   * } catch (e) {
   *   throw SchemaError.fromZod(e, data, { userId: "123" })
   * }
   */
  static fromZod<T>(
    e: ZodError<T>,           // Zod验证器发现的错误
    raw: unknown,             // 原始的、格式不正确的数据
    context?: Record<string, unknown>  // 额外的错误信息
  ): SchemaError {
    return new SchemaError({
      message: e.message,
      context: {
        raw: JSON.stringify(raw),
        ...context,
      },
    });
  }
}
