/**
 * Schema验证错误系统
 * 
 * 想象你在填写一份表格：
 * - 必填项没填（缺少必需字段）
 * - 手机号格式不对（字段格式错误）
 * - 年龄填了负数（字段值无效）
 * 
 * 这个类处理所有数据验证相关的错误
 */

import { BaseError } from "./base";

/**
 * Schema验证错误类
 * 处理数据格式、类型、约束等验证失败的情况
 */
export class SchemaError extends BaseError<{
  path?: string[];      // 验证失败的字段路径
  value?: unknown;      // 导致验证失败的值
  constraint?: string;  // 违反的约束条件
}> {
  public readonly retry = false; // 验证错误需要修改输入数据，不能重试
  public readonly name = "数据验证错误";

  /**
   * 创建一个Schema验证错误实例
   * 
   * @example
   * throw new SchemaError({
   *   message: "年龄必须是正整数",
   *   context: {
   *     path: ["user", "age"],
   *     value: -1,
   *     constraint: "minimum: 0"
   *   }
   * });
   */
  constructor(opts: {
    message: string;
    cause?: Error;
    context?: {
      path?: string[];
      value?: unknown;
      constraint?: string;
    };
  }) {
    super(opts);
  }
}
