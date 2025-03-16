/**
 * 基础错误处理和结果包装系统
 * 
 * 想象你在做一道数学题：
 * - 成功：算出了正确答案 (Ok)
 * - 失败：做错了，但知道错在哪里 (Err)
 * 
 * Result类型就像一张试卷，上面要么有正确答案，要么有错误标记
 */

import type { BaseError } from "./errors/base";

/**
 * 成功结果类型
 * 包装成功的返回值
 */
export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};

/**
 * 错误结果类型
 * 包装错误信息
 */
export type Err<E> = {
  readonly ok: false;
  readonly error: E;
};

/**
 * 结果类型
 * 要么是成功的结果，要么是错误
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * 创建一个成功的结果
 * @param value 成功的返回值
 * 
 * @example
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return Err("除数不能为0");
 *   }
 *   return Ok(a / b);
 * }
 */
export function Ok<T>(value?: T): Ok<T> {
  return { ok: true, value: value as T };
}

/**
 * 创建一个错误的结果
 * @param error 错误信息
 * 
 * @example
 * function findUser(id: string): Result<User, string> {
 *   const user = users.get(id);
 *   if (!user) {
 *     return Err("用户不存在");
 *   }
 *   return Ok(user);
 * }
 */
export function Err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * 将异步操作转换为结果类型
 * 捕获可能发生的错误并包装为Result
 * 
 * @param promise 要执行的异步操作
 * @returns 包装了成功值或错误的Result
 * 
 * @example
 * const result = await wrapAsync(fetchUserData(userId));
 * if (result.ok) {
 *   console.log("获取用户数据成功:", result.value);
 * } else {
 *   console.error("获取失败:", result.error);
 * }
 */
export async function wrapAsync<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    return Ok(await promise);
  } catch (e) {
    return Err(e as Error);
  }
}
