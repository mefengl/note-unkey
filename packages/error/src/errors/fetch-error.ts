/**
 * 网络请求错误系统
 * 
 * 想象你在给远方的朋友寄信：
 * - 地址写错了，信寄不到
 * - 邮局临时关门，现在寄不了
 * - 信件在路上丢失了
 * 
 * 这个类处理所有网络请求中可能出现的问题
 */

import { BaseError } from "./base";

/**
 * 网络请求错误类
 * 处理HTTP请求失败、超时等网络问题
 */
export class FetchError extends BaseError<{
  url: string;        // 请求的地址
  method: string;     // 请求方法(GET/POST等)
  [more: string]: unknown;  // 其他错误相关信息
}> {
  /**
   * 是否可以重试这个请求
   * - true: 临时性错误，可以重试（比如网络超时）
   * - false: 永久性错误，重试也没用（比如404页面不存在）
   */
  public readonly retry: boolean;

  /**
   * 错误类型名称
   */
  public readonly name = FetchError.name;

  /**
   * 创建一个新的网络请求错误
   * @param opts 错误配置
   * - message: 错误描述
   * - retry: 是否可以重试
   * - cause: 导致这个错误的原因（可选）
   * - context: 错误发生时的详细信息
   *   - url: 请求的地址
   *   - method: 请求方法
   *   - 其他相关信息
   * 
   * @example
   * throw new FetchError({
   *   message: "API服务器无响应",
   *   retry: true,
   *   context: {
   *     url: "https://api.example.com",
   *     method: "GET",
   *     timeout: 5000
   *   }
   * })
   */
  constructor(opts: {
    message: string;
    retry: boolean;
    cause?: BaseError;
    context?: {
      url: string;
      method: string;
      [more: string]: unknown;
    };
  }) {
    super(opts);
    this.retry = opts.retry;
  }
}
