/**
 * 环境配置错误系统
 * 
 * 想象你在准备画画：
 * - 画笔找不到了（缺少必需的环境变量）
 * - 颜料过期了（配置值无效或过期）
 * - 调色盘坏了（环境配置损坏）
 * 
 * 这个错误类处理程序运行环境中的配置问题
 */

import { BaseError } from "./base";

/**
 * 环境配置错误类
 * 处理所有与环境变量和配置相关的错误
 * 
 * @example
 * throw new EnvError({
 *   message: "缺少必需的环境变量",
 *   context: {
 *     name: "DATABASE_URL"
 *   }
 * });
 */
export class EnvError extends BaseError<{
  name: string;  // 出问题的环境变量名称
}> {
  public readonly retry = false; // 环境配置错误通常需要手动修复

  constructor(opts: {
    message: string;
    context?: { name: string };
    cause?: Error;
  }) {
    super(opts);
  }

  public readonly name = "环境配置错误";
}
