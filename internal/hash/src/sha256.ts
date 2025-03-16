/**
 * 哈希计算模块 - 把任何文字或数据变成一个独特的"指纹"
 * 
 * 想象一下，这个模块就像一个神奇的榨汁机：
 * 1. 你可以放入任何水果（数据）
 * 2. 榨汁机（SHA-256算法）会把水果榨成果汁
 * 3. 不管放多少水果，得到的果汁都是固定大小的杯子
 * 4. 同样的水果会得到同样的果汁，但不同的水果一定会得到不同的果汁
 * 
 * 这个"果汁"（哈希值）有什么用？
 * - 检查文件是否被修改过（比如下载的游戏是否完整）
 * - 安全地保存密码（不保存原始密码，只保存"果汁"）
 * - 生成独特的标识符（就像每个人的指纹都不一样）
 */

/**
 * 计算一段文字或数据的SHA-256哈希值
 * 
 * @param source - 要计算哈希值的文字或二进制数据
 * @returns 返回Base64格式的哈希值
 * 
 * 举例：
 * sha256("你好") => "D9/dZM7RWjbB+nS5C3H+oLzY3pFGaYWsT2RqyY7rdVc="
 * sha256("你好啊") => "完全不同的一串字符..."
 */
export async function sha256(source: string | Uint8Array): Promise<string> {
  // 如果输入是文字，先转换成二进制数据
  const buf = typeof source === "string" ? new TextEncoder().encode(source) : source;
  
  // 使用SHA-256算法计算哈希值
  const hash = await crypto.subtle.digest("sha-256", buf);
  
  // 把二进制的哈希值转换成可读的字符串
  return b64(hash);
}

const base64abc = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "+",
  "/",
];

/**
 * CREDIT: https://gist.github.com/enepomnyaschih/72c423f727d395eeaa09697058238727
 * Encodes a given Uint8Array, ArrayBuffer or string into RFC4648 base64 representation
 * @param data
 */
export function b64(data: ArrayBuffer | string): string {
  const uint8 =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let result = "";
  let i: number;
  const l = uint8.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[((uint8[i - 1] & 0x0f) << 2) | (uint8[i] >> 6)];
    result += base64abc[uint8[i] & 0x3f];
  }
  if (i === l + 1) {
    // 1 octet yet to write
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 0x03) << 4];
    result += "==";
  }
  if (i === l) {
    // 2 octets yet to write
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[(uint8[i - 1] & 0x0f) << 2];
    result += "=";
  }
  return result;
}

/**
 * Decodes a given RFC4648 base64 encoded string
 * @param b64
 */
export function decodeBase64(b64: string): Uint8Array {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}
