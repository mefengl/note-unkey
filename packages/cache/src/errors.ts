/**
 * 缓存系统错误
 * 
 * 想象你有一个便利贴记事本：
 * - 找不到写过的便利贴了（缓存丢失）
 * - 便利贴太旧看不清了（缓存过期）
 * - 记事本满了贴不下（缓存空间不足）
 * - 便利贴被别人撕掉了（缓存被删除）
 * 
 * 这个错误类处理数据缓存过程中的各种问题
 */

import { BaseError } from "@unkey/error";

/**
 * 缓存错误上下文类型
 * 记录缓存操作的详细信息
 */
export type CacheErrorContext = {
  /** 缓存层级（如：redis, memory） */
  tier: string;
  /** 缓存键名 */
  key: string;
  /** 其他相关信息 */
  [key: string]: unknown;
};

/**
 * 缓存错误类
 * 处理读写缓存时遇到的问题
 * 
 * @example
 * throw new CacheError({
 *   message: "Redis连接超时",
 *   tier: "redis",
 *   key: "user:123",
 *   retry: true
 * });
 */
export class CacheError extends BaseError<CacheErrorContext> {
  /**
   * 错误类型名称
   */
  public readonly name = "CacheError";

  /**
   * 是否可以重试
   * 有些缓存错误是暂时的，可以重试（如网络问题）
   * 有些是永久的，重试也没用（如键不存在）
   */
  public readonly retry: boolean;

  /**
   * 创建一个新的缓存错误
   * 
   * @param opts 错误配置
   * @param opts.message 错误描述
   * @param opts.tier 缓存层级
   * @param opts.key 缓存键名
   * @param opts.retry 是否可以重试
   * @param opts.cause 导致这个错误的原因（可选）
   * 
   * @example
   * new CacheError({
   *   tier: "redis",
   *   key: "user:123",
   *   message: "无法连接到Redis服务器",
   *   retry: true,
   *   cause: connectionError
   * })
   */
  constructor(opts: {
    tier: string;
    key: string;
    message: string;
    retry?: boolean;
    cause?: Error;
  }) {
    super({
      message: opts.message,
      cause: opts.cause,
      context: {
        tier: opts.tier,
        key: opts.key,
      },
    });
    this.retry = opts.retry ?? false;
  }
}
