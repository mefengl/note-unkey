/**
 * AES-GCM 加密模块
 * 
 * 想象一下你有一个特殊的盒子🎁，这个盒子可以把秘密（文字）变成乱码，
 * 只有拥有钥匙的人才能把乱码变回原来的秘密。
 * 
 * 这个模块就是用来：
 * 1. 创建这样的魔法盒子（加密器）
 * 2. 把秘密变成乱码（加密）
 * 3. 把乱码变回秘密（解密）
 * 
 * AES-GCM 是一种非常安全的加密方式：
 * - AES: 高级加密标准，就像一把非常结实的锁
 * - GCM: 伽罗瓦/计数器模式，可以检查秘密是否被篡改过
 * 
 * 举个例子：
 * 原文：  "我最喜欢的颜色是蓝色"
 * 加密后："%r2#k9&mP@..."（看起来像乱码）
 * 解密后：又变回"我最喜欢的颜色是蓝色"
 */

import { base64 } from "@unkey/encoding";

export class AesGCM {
  /** 加密用的密钥，就像打开魔法盒子的钥匙 */
  public readonly key: CryptoKey;

  /** 使用的加密算法名称 */
  public static readonly algorithm = "AES-GCM";

  /** 
   * 创建一个新的加密器
   * 这是一个私有构造函数，只能通过 withBase64Key 方法来创建实例
   */
  private constructor(key: CryptoKey) {
    this.key = key;
  }

  /**
   * 使用 Base64 格式的密钥创建加密器
   * 
   * Base64 是一种特殊的编码方式，可以把二进制数据变成可读的文字
   * 比如：密钥 "abc123..." 
   * 
   * @param base64Key - Base64格式的密钥字符串
   * @returns 返回一个可以用来加密和解密的 AesGCM 实例
   */
  static async withBase64Key(base64Key: string): Promise<AesGCM> {
    // 导入密钥，设置成可以用来加密和解密
    const key = await crypto.subtle.importKey(
      "raw",
      base64.decode(base64Key),
      { name: AesGCM.algorithm, length: 256 },  // 使用256位的密钥，非常安全
      false,  // 不允许导出密钥
      ["encrypt", "decrypt"],  // 允许用于加密和解密
    );
    return new AesGCM(key);
  }

  /**
   * 加密一段文字
   * 
   * 加密过程：
   * 1. 生成一个随机的初始向量(iv)，就像一个额外的小钥匙
   * 2. 使用这个小钥匙和主密钥一起加密文字
   * 3. 返回加密后的结果和小钥匙
   * 
   * @param secret - 需要加密的文字
   * @returns 返回初始向量(iv)和加密后的文字(ciphertext)
   */
  public async encrypt(secret: string): Promise<{ iv: string; ciphertext: string }> {
    // 生成32字节的随机初始向量
    const iv = crypto.getRandomValues(new Uint8Array(32));

    // 使用AES-GCM算法加密文字
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: AesGCM.algorithm,
        iv,  // 使用生成的初始向量
      },
      this.key,  // 使用我们的主密钥
      new TextEncoder().encode(secret),  // 把文字转换成二进制数据
    );

    // 返回Base64编码的结果
    return { 
      iv: base64.encode(iv),  // 编码初始向量
      ciphertext: base64.encode(ciphertext)  // 编码加密后的文字
    };
  }

  /**
   * 解密加密过的文字
   * 
   * 解密过程：
   * 1. 使用提供的初始向量(iv)和主密钥
   * 2. 对加密后的文字进行解密
   * 3. 得到原始的文字
   * 
   * @param req - 包含初始向量和加密文字的对象
   * @returns 返回解密后的原始文字
   */
  public async decrypt(req: { iv: string; ciphertext: string }): Promise<string> {
    // 使用AES-GCM算法解密
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: AesGCM.algorithm,
        iv: base64.decode(req.iv),  // 解码初始向量
      },
      this.key,  // 使用我们的主密钥
      base64.decode(req.ciphertext),  // 解码加密后的文字
    );

    // 把解密后的二进制数据转换回文字
    return new TextDecoder().decode(decryptedBuffer);
  }
}
