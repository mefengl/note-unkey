/**
 * 加密密钥管理模块
 * 
 * 想象一下你有一个特殊的魔法钥匙🔑，这个钥匙需要：
 * 1. 有一个版本号，这样我们知道它是新的还是旧的
 * 2. 有一段随机数，确保每个钥匙都是独一无二的
 * 3. 可以变成一串文字保存起来，之后再变回钥匙使用
 * 
 * 举个例子：
 * 钥匙信息：
 *  - 版本：v1
 *  - 编号：1
 *  - 类型：AES-GCM
 *  - 随机码：abc123...
 * 
 * 变成字符串：v1_1_AES-GCM_abc123...
 */

import { base64 } from "@unkey/encoding";
import { BaseError, Err, Ok, type Result } from "@unkey/error";

/**
 * 密钥加密系统
 * 
 * 想象你在管理一个保险箱：
 * - 有时需要把密码记在纸上（序列化）
 * - 有时需要把纸上的密码输入（反序列化）
 * - 如果纸张损坏或字迹模糊就会出错
 */

/**
 * 序列化错误类
 * 当把钥匙变成字符串（或反过来）出错时使用
 */
export class SerializationError extends BaseError {
  /**
   * 序列化错误不能通过重试解决
   * 通常需要检查数据格式
   */
  public readonly retry = false;

  /**
   * 错误类型名称
   */
  public readonly name = SerializationError.name;
}

/**
 * 加密密钥类
 * 用来管理和存储加密用的钥匙
 */
export class EncryptionKey {
  /** 使用的加密算法类型 */
  public readonly algorithm: "AES-GCM";
  
  /** 钥匙的格式版本 */
  public readonly schemaVersion: "v1";
  
  /** 钥匙的版本号，方便更换新钥匙 */
  public readonly keyVersion: number;
  
  /** 随机生成的密钥内容 */
  public readonly random: string;

  /**
   * 创建一个新的钥匙对象
   * 这是一个私有构造函数，只能通过 new 方法来创建实例
   */
  private constructor(opts: {
    algorithm: "AES-GCM";
    schemaVersion: "v1";
    keyVersion: number;
    random: string;
  }) {
    this.algorithm = opts.algorithm;
    this.schemaVersion = opts.schemaVersion;
    this.keyVersion = opts.keyVersion;
    this.random = opts.random;
  }

  /**
   * 创建一个全新的钥匙
   * 
   * 过程：
   * 1. 生成64字节的随机数据
   * 2. 设置当前使用的算法和版本信息
   * 3. 返回新的钥匙对象
   * 
   * @param opts - 包含钥匙版本号的配置
   * @returns 返回一个新的加密钥匙对象
   */
  static new(opts: { keyVersion: 1 }): EncryptionKey {
    return new EncryptionKey({
      // 生成64字节的随机数，并转换成Base64格式
      random: base64.encode(crypto.getRandomValues(new Uint8Array(64))),
      algorithm: "AES-GCM",    // 使用AES-GCM加密算法
      schemaVersion: "v1",     // 使用v1版本的钥匙格式
      keyVersion: opts.keyVersion,
    });
  }

  /**
   * 从字符串恢复钥匙对象
   * 
   * 举例：
   * 输入："v1_1_AES-GCM_abc123..."
   * 输出：一个包含这些信息的钥匙对象
   * 
   * @param s - 包含钥匙信息的字符串
   * @returns 如果成功则返回钥匙对象，失败则返回错误
   */
  static fromString(s: string): Result<EncryptionKey, SerializationError> {
    // 先检查版本号
    const schemaVersion = s.split("_").at(0);
    if (!schemaVersion) {
      return Err(
        new SerializationError({
          message: `unable to extract schema version: ${s}`,
        }),
      );
    }

    // 根据不同版本处理
    switch (schemaVersion) {
      case "v1": {
        // 把字符串分成四部分：版本_钥匙版本_算法_随机数
        const [_, keyVersion, algorithm, random] = s.split("_");
        return Ok(
          new EncryptionKey({
            schemaVersion,
            keyVersion: Number.parseInt(keyVersion),
            // @ts-expect-error
            algorithm,
            random,
          }),
        );
      }
      default:
        return Err(
          new SerializationError({
            message: `unable to deserialize version: ${schemaVersion}`,
          }),
        );
    }
  }

  /**
   * 把钥匙对象变成字符串
   * 
   * 举例：
   * 钥匙对象 -> "v1_1_AES-GCM_abc123..."
   * 
   * @returns 包含钥匙所有信息的字符串
   */
  public toString(): string {
    switch (this.schemaVersion) {
      case "v1":
        // 把所有信息用下划线连接起来
        return [this.schemaVersion, this.keyVersion, this.algorithm, this.random].join("_");
      default:
        break;
    }
    throw new Error(`unable to handle schemaVersion: ${this.schemaVersion}`);
  }
}
