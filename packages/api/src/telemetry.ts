/**
 * 遥测数据收集模块
 * 
 * 该模块负责收集SDK使用的基本信息，如运行环境、平台和SDK版本
 * 这些数据用于改进服务质量和分析用户使用模式
 */
import { version } from "../package.json";
import type { UnkeyOptions } from "./client";

/**
 * 遥测数据结构定义
 */
export type Telemetry = {
  /**
   * SDK版本信息
   * 在请求头中作为 Unkey-Telemetry-Sdk 发送
   * @example @unkey/api@v1.1.1
   */
  sdkVersions: string[];
  /**
   * 平台信息
   * 在请求头中作为 Unkey-Telemetry-Platform 发送
   * @example cloudflare
   */
  platform?: string;
  /**
   * 运行时环境信息
   * 在请求头中作为 Unkey-Telemetry-Runtime 发送
   * @example node@v18
   */
  runtime?: string;
};

/**
 * 获取遥测数据
 * 
 * 基于当前环境和SDK选项收集遥测信息
 * 如果环境变量 UNKEY_DISABLE_TELEMETRY 被设置，则返回 null
 *
 * @param opts Unkey客户端选项
 * @returns 遥测数据对象或null（如果禁用）
 */
export function getTelemetry(opts: UnkeyOptions): Telemetry | null {
  let platform: string | undefined;
  let runtime: string | undefined;
  const sdkVersions = [`@unkey/api@${version}`];

  try {
    if (typeof process !== "undefined") {
      // 检查是否禁用遥测
      if (process.env.UNKEY_DISABLE_TELEMETRY) {
        return null;
      }
      
      // 检测平台类型
      platform = process.env.VERCEL ? "vercel" : process.env.AWS_REGION ? "aws" : undefined;
      
      // 检测运行时环境
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined") {
        runtime = "edge-light";
      } else {
        runtime = `node@${process.version}`;
      }
    }

    // 添加包装SDK版本（如果提供）
    if (opts.wrapperSdkVersion) {
      sdkVersions.push(opts.wrapperSdkVersion);
    }
  } catch (_error) {
    // 静默处理错误，确保遥测收集不会破坏主要功能
  }

  return { platform, runtime, sdkVersions };
}
