/**
 * 缓存系统接口定义
 * 
 * 继续用学校储物柜的比喻：
 * - 储物柜区域(CacheNamespace)：管理特定类型的储物柜
 * - 储物柜系统(Cache)：管理所有区域的储物柜
 * 
 * 每个区域都提供四种基本操作：
 * 1. 获取(get)：查看储物柜里的东西
 * 2. 存放(set)：把东西放进储物柜
 * 3. 移除(remove)：清空储物柜
 * 4. 智能获取(swr)：特殊的获取方式，保证总能拿到东西
 */

import type { Result } from "@unkey/error";
import type { CacheError } from "./errors";

/**
 * 缓存区域接口
 * 定义了每个缓存区域必须提供的基本操作
 */
interface CacheNamespace<TValue> {
  /**
   * 获取缓存的值
   * 
   * 就像查看储物柜里是否有东西：
   * - undefined：代表储物柜是空的（cache miss）
   * - null：代表根本没有这个储物柜
   * - 有值：找到了储物柜里的东西
   * 
   * @param key - 储物柜编号
   * @returns 返回储物柜里的内容，或表示没找到
   */
  get: (key: string) => Promise<Result<TValue | undefined, CacheError>>;

  /**
   * 设置缓存的值
   * 
   * 就像把东西放进储物柜：
   * - key：储物柜编号
   * - value：要存放的东西
   * - opts：存放的规则
   *   - fresh：多久之内的东西算新鲜的
   *   - stale：多久之后的东西算过期的
   * 
   * 举例：
   * 午餐放进储物柜：
   * - fresh：2小时内是新鲜的
   * - stale：4小时后就不能吃了
   */
  set: (
    key: string,
    value: TValue,
    opts?: {
      fresh: number;  // 新鲜期（毫秒）
      stale: number;  // 过期期（毫秒）
    },
  ) => Promise<Result<void, CacheError>>;

  /**
   * 移除缓存的值
   * 
   * 就像清空储物柜：
   * - 可以清空一个储物柜
   * - 也可以一次清空多个储物柜
   * 
   * @param key - 要清空的储物柜编号（一个或多个）
   */
  remove: (key: string | string[]) => Promise<Result<void, CacheError>>;

  /**
   * SWR (Stale-While-Revalidate) 模式获取
   * 
   * 这是一种特殊的"智能获取"方式：
   * 1. 先看储物柜里有没有东西
   * 2. 如果没有，就去源头拿（比如去教室拿书）
   * 3. 如果有但不新鲜了，就：
   *    - 先把不新鲜的拿来用（总比没有强）
   *    - 同时去源头拿新的，放进储物柜
   * 
   * @param key - 储物柜编号
   * @param refreshFromOrigin - 从源头获取新东西的方法
   */
  swr(
    key: string,
    refreshFromOrigin: (key: string) => Promise<TValue | undefined>,
  ): Promise<Result<TValue | undefined, CacheError>>;
}

/**
 * 完整的缓存系统类型
 * 
 * 就像整个学校的储物柜系统：
 * - 每个年级都有自己的储物柜区域
 * - 每个区域都提供相同的基本操作
 * 
 * 使用示例：
 * type SchoolCache = Cache<{
 *   grade1: Grade1Items;    // 一年级的储物柜
 *   grade2: Grade2Items;    // 二年级的储物柜
 *   teachers: TeacherItems; // 老师的储物柜
 * }>;
 */
export type Cache<TNamespaces extends Record<string, unknown>> = {
  [TName in keyof TNamespaces]: CacheNamespace<TNamespaces[TName]>;
};
