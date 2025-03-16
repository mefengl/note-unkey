/**
 * 缓存系统错误
 * 
 * 想象你有一个便利贴记事本：
 * - 找不到写过的便利贴了（缓存丢失）
 * - 便利贴太旧看不清了（缓存过期）
 * - 记事本满了贴不下（缓存空间不足）
 * 
 * 这个错误类处理数据缓存过程中的各种问题
 */

import { BaseError } from "@unkey/error";

/**
 * 缓存错误类
 * 处理读写缓存时遇到的问题
 */
export class CacheError extends BaseError {
  /**
   * 错误类型名称
   */
  public readonly name = "CacheError";

  /**
   * 是否可以重试
   * 缓存错误通常不需要重试，因为可以直接读取原始数据
   */
  public readonly retry = false;

  /**
   * 出错的缓存层级
   * 例如: "memory", "redis" 等
   */
  public readonly tier: string;

  /**
   * 出问题的缓存键名
   */
  public readonly key: string;

  /**
   * 创建一个新的缓存错误
   * @param opts 错误配置
   * - tier: 缓存层级名称
   * - key: 缓存键名
   * - message: 错误描述
   * 
   * @example
   * throw new CacheError({
   *   tier: "redis",
   *   key: "user:123",
   *   message: "无法连接到Redis服务器"
   * })
   */
  constructor(opts: {
    tier: string;
    key: string;
    message: string;
  }) {
    super(opts);
    this.name = "CacheError";
    this.tier = opts.tier;
    this.key = opts.key;
  }
}
