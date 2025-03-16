/**
 * ClickHouse数据库错误处理系统
 * 
 * 想象你在管理一个大型图书馆：
 * - 新书上架时出错了（插入错误）
 * - 查找书籍信息失败了（查询错误）
 * 
 * 这个模块处理与ClickHouse数据库交互时可能遇到的问题
 */

import { BaseError } from "@unkey/error";

/**
 * 数据插入错误
 * 当向ClickHouse写入数据失败时使用
 */
export class InsertError extends BaseError {
  /**
   * 是否可以重试
   * 插入错误通常可以重试，因为可能是临时性问题
   */
  public readonly retry = true;
  
  /**
   * 错误类型名称
   */
  public readonly name = InsertError.name;

  /**
   * 创建一个新的插入错误
   * @param message 错误描述
   * 
   * @example
   * throw new InsertError("无法插入用户访问日志")
   */
  constructor(message: string) {
    super({
      message,
    });
  }
}

/**
 * 数据查询错误
 * 当ClickHouse查询执行失败时使用
 */
export class QueryError extends BaseError<{ query: string }> {
  /**
   * 是否可以重试
   * 查询错误通常可以重试，因为可能是临时性问题
   */
  public readonly retry = true;

  /**
   * 错误类型名称
   */
  public readonly name = QueryError.name;

  /**
   * 创建一个新的查询错误
   * @param message 错误描述
   * @param context 错误上下文
   * - query: 导致错误的SQL查询语句
   * 
   * @example
   * throw new QueryError(
   *   "查询超时", 
   *   { query: "SELECT * FROM events" }
   * )
   */
  constructor(message: string, context: { query: string }) {
    super({
      message,
      context,
    });
  }
}
