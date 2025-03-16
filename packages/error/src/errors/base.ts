/**
 * 错误处理基础架构
 * 
 * 想象我们在建造一个错误处理工厂：
 * - 每种错误都是一种产品
 * - 每个错误都需要记录具体情况
 * - 错误之间可能有因果关系
 * - 有些错误可以修复重试，有些不行
 * 
 * 这个是所有错误类型的"蓝图"，定义了最基本的错误结构
 */

/**
 * 错误上下文类型
 * 记录错误发生时的具体情况，可以是任何额外信息
 * 
 * @example
 * {
 *   userId: "123",
 *   action: "删除文件",
 *   timestamp: "2023-01-01"
 * }
 */
export type ErrorContext = Record<string, unknown>;

/**
 * 基础错误类
 * 所有具体的错误类型都继承这个类
 * 
 * @example
 * class 网络错误 extends BaseError {
 *   name = "网络错误"
 *   retry = true  // 网络错误通常可以重试
 * }
 */
export abstract class BaseError<
  TContext extends ErrorContext = ErrorContext
> extends Error {
  /**
   * 错误是否可以通过重试解决
   * 比如：
   * - 网络超时：可以重试 ✅
   * - 语法错误：不能重试 ❌
   */
  public abstract readonly retry: boolean;

  /**
   * 导致这个错误的原因（错误链）
   * 
   * 比如：
   * 1. 数据库连接失败
   * 2. 导致查询失败
   * 3. 导致用户信息获取失败
   */
  public readonly cause: BaseError | undefined;

  /**
   * 错误发生时的详细信息
   * 帮助开发者理解错误发生的具体场景
   * 
   * @example
   * {
   *   function: "getUserData",
   *   parameters: { id: 123 },
   *   state: "初始化数据库连接"
   * }
   */
  public readonly context: TContext | undefined;

  /**
   * 错误消息
   * 清晰描述发生了什么问题
   */
  public readonly message: string;

  /**
   * 错误类型名称
   * 用于快速识别错误类别
   * 
   * @example
   * "DatabaseError", "ValidationError", "NetworkError"
   */
  public abstract readonly name: string;

  /**
   * 创建一个新的错误实例
   * 
   * @param opts 错误配置对象
   * @param opts.message 错误描述
   * @param opts.cause 导致这个错误的原因
   * @param opts.context 错误发生时的详细信息
   * 
   * @example
   * new DatabaseError({
   *   message: "无法连接到数据库",
   *   cause: networkError,
   *   context: { host: "db.example.com" }
   * })
   */
  constructor(opts: {
    message: string;
    cause?: BaseError;
    context?: TContext;
  }) {
    super(opts.message);
    this.message = opts.message;
    this.cause = opts.cause;
    this.context = opts.context;
  }

  /**
   * 生成错误的详细描述
   * 包含错误类型、消息、上下文和原因
   * 
   * @returns 格式化的错误信息
   * 
   * @example
   * DatabaseError: 连接超时 
   * - 上下文: {"host":"db.example.com","retry":3}
   * - 原因: NetworkError: DNS解析失败
   */
  public toString(): string {
    return `${this.name}: ${this.message} - ${JSON.stringify(
      this.context,
    )} - caused by ${this.cause?.toString()}`;
  }
}
