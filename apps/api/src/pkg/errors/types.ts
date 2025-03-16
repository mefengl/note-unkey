/**
 * 定义错误类型和错误代码
 * 这个文件集中管理所有可能的错误类型
 */

/**
 * 错误代码枚举
 * 描述所有可能的错误情况
 */
export type ErrorCode =
  | "BAD_REQUEST"           // 输入验证失败或请求格式错误
  | "UNAUTHORIZED"          // 需要身份认证
  | "FORBIDDEN"            // 无访问权限
  | "NOT_FOUND"           // 请求的资源不存在
  | "CONFLICT"            // 资源冲突，例如重复创建
  | "PRECONDITION_FAILED" // 前置条件检查失败
  | "TOO_MANY_REQUESTS"   // 请求频率超限
  | "INTERNAL_SERVER_ERROR" // 服务器内部错误
  | "METHOD_NOT_ALLOWED"  // HTTP方法不被允许
  | "INSUFFICIENT_PERMISSIONS" // 权限不足以执行操作
  | "USAGE_EXCEEDED"      // 使用配额超限
  | "DISABLED"           // 功能或资源已被禁用
  | "EXPIRED"           // 资源已过期
  | "DELETE_PROTECTED"; // 资源受保护无法删除

/**
 * 标准错误响应结构
 */
export interface ErrorResponse {
  error: {
    /** 机器可读的错误代码 */
    code: ErrorCode;
    /** 指向详细文档的链接 */
    docs: string;
    /** 人类可读的错误消息 */
    message: string;
    /** 用于追踪和调试的请求ID */
    requestId: string;
  };
}

/**
 * 验证错误的详细信息
 */
export interface ValidationError {
  /** 错误发生的字段路径 */
  field: string;
  /** 具体的错误消息 */
  message: string;
  /** 验证失败的具体原因代码 */
  code: string;
}