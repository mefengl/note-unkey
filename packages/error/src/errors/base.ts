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
 * 
 * @example
 * class 格式错误 extends BaseError {
 *   name = "格式错误"
 *   retry = false // 格式错误需要修改后才能重试
 * }
 */
export abstract class BaseError<
  // 错误上下文的类型，默认是基础的ErrorContext
  TContext extends ErrorContext = ErrorContext
> extends Error {
  /**
   * 错误是否可以通过重试解决
   * 子类必须实现这个属性
   */
  public abstract readonly retry: boolean;

  /**
   * 导致这个错误的原因
   * 比如：数据库连接错误导致了查询错误
   */
  public readonly cause: BaseError | undefined;

  /**
   * 错误发生时的具体情况
   * 比如：发生错误时的参数值、状态等
   */
  public readonly context: TContext | undefined;

  /**
   * 错误的具体描述信息
   */
  public readonly message: string;

  /**
   * 错误的类型名称
   * 子类必须实现这个属性
   */
  public abstract readonly name: string;

  /**
   * 创建一个新的错误实例
   * @param opts 错误的配置信息
   * - message: 错误描述
   * - cause: 导致这个错误的原因（可选）
   * - context: 错误发生时的具体情况（可选）
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
   * 把错误转换成易读的文字
   * 就像把错误报告单整理成一段容易理解的话
   * 
   * 比如：
   * "作业错误：没写完整 - 在第3页第2题 - 因为没带课本"
   */
  public toString(): string {
    return `${this.name}: ${this.message} - ${JSON.stringify(
      this.context,
    )} - caused by ${this.cause?.toString()}`;
  }
}
