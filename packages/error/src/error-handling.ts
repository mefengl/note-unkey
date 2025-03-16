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
 * 包装成功情况下的返回值
 * 
 * @template T 成功值的类型
 */
export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};

/**
 * 错误结果类型
 * 包装失败情况下的错误信息
 * 
 * @template E 错误值的类型
 */
export type Err<E> = {
  readonly ok: false;
  readonly error: E;
};

/**
 * 结果类型
 * 表示一个操作的两种可能结果：成功或失败
 * 
 * @template T 成功值的类型
 * @template E 错误值的类型
 * 
 * @example
 * type 除法结果 = Result<number, "除数不能为零">;
 * type 用户查询 = Result<User, "用户不存在">;
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * 创建一个成功的结果
 * 包装成功的返回值
 * 
 * @template T 成功值的类型
 * @param value 要包装的值
 * @returns 包装后的成功结果
 * 
 * @example
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return Err("除数不能为零");
 *   }
 *   return Ok(a / b);
 * }
 */
export function Ok<T>(value?: T): Ok<T> {
  return { ok: true, value: value as T };
}

/**
 * 创建一个错误的结果
 * 包装错误信息
 * 
 * @template E 错误值的类型
 * @param error 错误信息
 * @returns 包装后的错误结果
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
 * @returns Promise<Result<T, E>>
 * 
 * @example
 * const result = await toResult(fetchUserData(userId));
 * if (result.ok) {
 *   console.log("用户数据:", result.value);
 * } else {
 *   console.error("获取失败:", result.error);
 * }
 */
export async function toResult<T, E = unknown>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    return Ok(await promise);
  } catch (error) {
    return Err(error as E);
  }
}

/**
 * 处理Result的辅助函数
 * 根据结果类型执行不同的回调函数
 * 
 * @param result 要处理的结果
 * @param handlers 处理函数对象
 * @returns 处理后的值
 * 
 * @example
 * const result = divide(10, 2);
 * const message = match(result, {
 *   ok: (value) => `结果是: ${value}`,
 *   err: (error) => `出错了: ${error}`
 * });
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  },
): U {
  if (result.ok) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}
