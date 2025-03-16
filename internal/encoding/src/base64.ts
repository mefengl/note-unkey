/**
 * Base64编码模块
 * 
 * 想象一下，这个模块就像一个特殊的翻译官：
 * 1. 可以把计算机的二进制语言（010101...）翻译成人类可以读的文字（ABC123...）
 * 2. 也可以把人类的文字翻译回计算机的语言
 * 
 * Base64使用64个特殊字符来进行翻译：
 * - 26个大写字母（A-Z）
 * - 26个小写字母（a-z）
 * - 10个数字（0-9）
 * - 2个特殊符号（+和/）
 * 
 * 为什么要用Base64？
 * - 因为有些系统只能处理文字，不能直接处理二进制数据
 * - 就像我们要把中文歌词翻译成英文，让不懂中文的人也能读懂
 */

// Base64的64个字符表，就像翻译官的词典
const base64abc = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"
];

/**
 * 编码函数 - 把数据翻译成Base64格式
 * 
 * 想象这个过程就像：
 * 1. 把一张图片或文字转换成二进制数据（010101...）
 * 2. 每6位二进制数找到对应的一个Base64字符
 * 3. 最后把所有字符拼在一起
 * 
 * 举例：
 * "Hello" => "SGVsbG8="
 * "你好" => "5L2g5aW9"
 * 
 * @param data - 要编码的数据（可以是文字或二进制数据）
 * @returns 编码后的Base64字符串
 */
function encode(data: ArrayBuffer | string): string {
  // 确保输入数据是二进制格式
  const uint8 =
    typeof data === "string"
      ? new TextEncoder().encode(data)  // 如果是文字，先转成二进制
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  let result = "";
  let i: number;
  const l = uint8.length;

  // 每次处理3个字节，转换成4个Base64字符
  for (i = 2; i < l; i += 3) {
    result += base64abc[uint8[i - 2] >> 2];  // 第1个字符
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];  // 第2个字符
    result += base64abc[((uint8[i - 1] & 0x0f) << 2) | (uint8[i] >> 6)];  // 第3个字符
    result += base64abc[uint8[i] & 0x3f];  // 第4个字符
  }

  // 处理剩余的1个字节
  if (i === l + 1) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 0x03) << 4];
    result += "==";  // 用等号补充缺少的部分
  }

  // 处理剩余的2个字节
  if (i === l) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[(uint8[i - 1] & 0x0f) << 2];
    result += "=";  // 用等号补充缺少的部分
  }

  return result;
}

/**
 * 解码函数 - 把Base64格式的字符串翻译回原来的数据
 * 
 * 想象这个过程就像：
 * 1. 看到一串Base64字符串："SGVsbG8="
 * 2. 把每个字符转回6位二进制数
 * 3. 最后重新组合成原始数据："Hello"
 * 
 * @param b64 - Base64格式的字符串
 * @returns 解码后的二进制数据
 */
function decode(b64: string): Uint8Array {
  // 使用浏览器内置的atob函数解码Base64字符串
  const binString = atob(b64);
  const size = binString.length;
  
  // 创建一个新的二进制数组来存储解码后的数据
  const bytes = new Uint8Array(size);
  
  // 把每个字符转换成对应的数字编码
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  
  return bytes;
}

// 导出编码和解码函数
export const base64 = {
  encode,  // 编码：数据 -> Base64字符串
  decode   // 解码：Base64字符串 -> 数据
};
