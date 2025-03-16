/**
 * 环境配置错误系统
 * 
 * 想象你在准备画画：
 * - 画笔找不到了（缺少必需的工具）
 * - 颜料过期了（配置过期或无效）
 * - 调色盘坏了（环境损坏）
 * 
 * 这个错误类处理程序运行环境中的配置问题
 */

import { BaseError } from "./base";

/**
 * 环境变量错误类
 * 当程序运行需要的环境变量配置不正确时使用
 * 
 * @example
 * if (!process.env.DATABASE_URL) {
 *   throw new EnvError({
 *     message: "数据库连接地址未配置",
 *     context: { name: "DATABASE_URL" }
 *   })
 * }
 */
export class EnvError extends BaseError<{
  name: string;  // 出问题的环境变量名称
}> {
  /**
   * 是否可以重试
   * 环境配置错误一般需要手动修复，不能自动重试
   */
  public readonly retry = false;

  /**
   * 错误类型名称
   */
  public readonly name = EnvError.name;
}
