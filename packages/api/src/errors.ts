/**
 * 错误处理模块
 * 
 * 该模块定义了API响应中可能出现的错误类型
 * 通过与OpenAPI规范中定义的路径类型集成，提供类型安全的错误处理
 */
import type { paths } from "./openapi";

/**
 * API错误响应类型
 * 
 * 这个联合类型包含了所有可能的API错误响应格式
 * 每种类型对应一个特定的HTTP状态码和错误数据结构
 * 
 * 包括以下常见HTTP错误:
 * - 400: 错误请求
 * - 401: 未认证
 * - 403: 禁止访问
 * - 404: 未找到资源
 * - 409: 资源冲突
 * - 429: 请求过多
 * - 500: 服务器内部错误
 */
export type ErrorResponse =
  | paths["/v1/liveness"]["get"]["responses"]["400"]["content"]["application/json"]
  | paths["/v1/liveness"]["get"]["responses"]["401"]["content"]["application/json"]
  | paths["/v1/liveness"]["get"]["responses"]["403"]["content"]["application/json"]
  | paths["/v1/liveness"]["get"]["responses"]["404"]["content"]["application/json"]
  | paths["/v1/liveness"]["get"]["responses"]["409"]["content"]["application/json"]
  | paths["/v1/liveness"]["get"]["responses"]["429"]["content"]["application/json"]
  | paths["/v1/liveness"]["get"]["responses"]["500"]["content"]["application/json"];
