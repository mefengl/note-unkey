/**
 * 验证密钥的独立功能模块
 * 
 * 这个模块提供了一个简化的方法来验证API密钥，无需完整的客户端配置
 */
import type { PermissionQuery } from "@unkey/rbac";
import { Unkey } from "./client";
import type { paths } from "./openapi";

/**
 * 验证密钥的有效性
 * 
 * 这是一个便捷函数，用于验证API密钥而无需完整初始化Unkey客户端
 * 内部使用公共访问模式创建一个临时客户端
 *
 * @example
 * ```ts
 * const { result, error } = await verifyKey("key_123")
 * if (error){
 *   // 处理潜在的网络或请求错误
 *   // 错误文档链接将在 `error.docs` 字段中
 *   console.error(error.message)
 *   return
 * }
 * if (!result.valid) {
 *   // 不授予访问权限
 *   return
 * }
 *
 * // 处理请求
 * console.log(result)
 * ```
 */
export function verifyKey<TPermission extends string = string>(
  req:
    | string
    | (Omit<
        paths["/v1/keys.verifyKey"]["post"]["requestBody"]["content"]["application/json"],
        "authorization"
      > & { authorization?: { permissions: PermissionQuery<TPermission> } }),
) {
  // 是的，这里是空的只是为了让typescript满意，但我们实际上不需要令牌来验证密钥
  // 这不是最干净的方式，但目前它有效 :)
  const unkey = new Unkey({ rootKey: "public" });
  return unkey.keys.verify(typeof req === "string" ? { key: req } : req);
}
