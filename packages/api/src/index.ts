/**
 * @unkey/api 客户端SDK
 * 
 * 这个包提供了与Unkey API服务交互的便捷方法，
 * 让开发者可以轻松地管理API密钥、速率限制和身份验证。
 * 
 * @example
 * import { Unkey } from '@unkey/api';
 * 
 * const unkey = new Unkey({
 *   rootKey: 'your_root_key_here'
 * });
 * 
 * // 验证API密钥
 * const { result, error } = await unkey.keys.verify({
 *   key: 'user_provided_key'
 * });
 */

export * from "./client";
export * from "./verify";
export * from "./errors";
export { and, or, type Flatten } from "@unkey/rbac";
