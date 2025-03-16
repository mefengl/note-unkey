/**
 * 网络请求错误系统
 * 
 * 想象你在给远方的朋友寄信：
 * - 地址写错了，信寄不到 (404错误)
 * - 邮局临时关门，现在寄不了 (503错误) 
 * - 信件在路上丢失了 (网络超时)
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
  statusCode?: number;  // HTTP状态码
  timeout?: number;     // 超时设置(毫秒)
  [more: string]: unknown;  // 其他错误相关信息
}> {
  public readonly retry: boolean;
  public readonly name = "网络请求错误";

  /**
   * 创建一个网络请求错误实例
   * 
   * @param opts 错误配置
   * @param opts.message 错误描述
   * @param opts.retry 是否可以重试请求
   * @param opts.cause 导致错误的原因
   * @param opts.context 错误发生时的详细信息
   *   - url: 请求的地址
   *   - method: 请求方法
   *   - statusCode: HTTP状态码
   *   - timeout: 超时设置
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
      statusCode?: number;
      timeout?: number;
      [more: string]: unknown;
    };
  }) {
    super({
      message: opts.message,
      cause: opts.cause,
      context: opts.context,
    });
    this.retry = opts.retry;
  }

  /**
   * 从Response对象创建错误实例
   */
  static async fromResponse(response: Response): Promise<FetchError> {
    const text = await response.text();
    return new FetchError({
      message: `请求失败: ${response.status} ${response.statusText}`,
      retry: response.status >= 500, // 5xx错误通常可以重试
      context: {
        url: response.url,
        method: 'GET',
        statusCode: response.status,
      },
    });
  }
}
