/**
 * 这是一个特殊的ID生成器！
 * 
 * 想象一下，在一个大图书馆里，每本书都需要一个独特的编号，这样我们才能快速找到它。
 * 这个程序就是用来生成这样的"编号"的，不过它生成的编号有这些特点：
 * 
 * 1. 前缀识别：就像图书馆里不同类型的书有不同的标记
 *    - key_ 开头的是密钥ID
 *    - pol_ 开头的是策略ID
 *    - api_ 开头的是API相关的ID
 *    ...等等
 * 
 * 2. 时间顺序：编号中包含了生成时间
 *    - 这就像在书的编号里加入入库的年份
 *    - 我们用了一个特殊的时间起点：2023年11月14日
 *    - 从这个时间开始计算，可以使用136年！
 * 
 * 3. 随机性：为了确保编号不会重复
 *    - 就像在编号中加入随机数字
 *    - 使用了计算机的随机数生成器
 * 
 * 4. 编码方式：使用特殊的58个字符来表示
 *    - 不使用数字0和字母O，避免混淆
 *    - 不使用字母I和l，因为它们看起来太像了
 *    - 这样生成的ID既短小又容易辨认
 */

import baseX from "base-x";

// 使用58个特殊字符来编码，去掉了容易混淆的字符(0,O,I,l)
const b58 = baseX("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz");

/**
 * 各种类型ID的前缀定义
 * 就像图书馆里：
 * - 小说区的书用"XS_"开头
 * - 科学区的书用"KX_"开头
 */
const prefixes = {
  key: "key",        // API密钥的ID前缀
  policy: "pol",     // 策略的ID前缀
  api: "api",        // API相关的ID前缀
  request: "req",    // 请求的ID前缀
  workspace: "ws",   // 工作空间的ID前缀
  keyAuth: "ks",     // 密钥验证空间的ID前缀
  vercelBinding: "vb", // Vercel绑定的ID前缀
  role: "role",      // 角色的ID前缀
  test: "test",      // 测试用的ID前缀
  ratelimitNamespace: "rlns", // 限流命名空间的ID前缀
  ratelimitOverride: "rlor",  // 限流覆盖规则的ID前缀
  permission: "perm", // 权限的ID前缀
  secret: "sec",      // 密钥的ID前缀
  headerRewrite: "hrw", // 请求头重写规则的ID前缀
  gateway: "gw",      // 网关的ID前缀
  llmGateway: "lgw",  // LLM网关的ID前缀
  webhook: "wh",      // Webhook的ID前缀
  event: "evt",       // 事件的ID前缀
  reporter: "rep",    // 报告器的ID前缀
  webhookDelivery: "whd", // Webhook投递的ID前缀
  identity: "id",     // 身份的ID前缀
  ratelimit: "rl",    // 限流规则的ID前缀
  auditLogBucket: "buk", // 审计日志桶的ID前缀
  auditLog: "log",    // 审计日志的ID前缀
} as const;

/**
 * 生成一个新的ID
 * 例如: key_XXXXXXXXXXXXXX
 * 
 * @param prefix - ID的类型前缀，比如"key"/"api"等
 * @returns 生成的唯一ID
 * 
 * 举个例子：
 * 1. 当我们要创建一个新的API密钥时：
 *    newId("key") 可能会返回 "key_2Ny6tZtMp3br"
 * 
 * 2. 当我们要创建一个新的工作空间时：
 *    newId("ws") 可能会返回 "ws_9HqLvN4kX2ps"
 */
export function newId<TPrefix extends keyof typeof prefixes>(prefix: TPrefix) {
  // 创建一个12字节的随机数组
  const buf = crypto.getRandomValues(new Uint8Array(12));

  /**
   * 设定一个特殊的时间起点：2023年11月14日晚上10:13:20
   * 为什么选这个时间？因为从这个时间开始计算，
   * 我们的ID系统可以使用到2159年12月22日！
   */
  const EPOCH_TIMESTAMP_SEC = 1_700_000_000; // 以秒为单位

  // 计算从特殊时间起点到现在过了多少秒
  const t = Math.floor(Date.now() / 1000) - EPOCH_TIMESTAMP_SEC;

  // 把时间信息存入随机数组的前4个字节
  buf[0] = (t >>> 24) & 255;  // 时间的最高位字节
  buf[1] = (t >>> 16) & 255;  // 时间的次高位字节
  buf[2] = (t >>> 8) & 255;   // 时间的次低位字节
  buf[3] = t & 255;           // 时间的最低位字节

  // 组合前缀和编码后的随机数组，生成最终的ID
  return `${prefixes[prefix]}_${b58.encode(buf)}` as const;
}
