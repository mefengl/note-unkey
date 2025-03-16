/**
 * SWR (Stale-While-Revalidate) 缓存策略实现
 * 
 * 想象一个更智能的储物柜系统：
 * 1. 每个物品都有保质期（新鲜时间和过期时间）
 * 2. 当物品不新鲜但还没过期时：
 *    - 先把现有的拿出来用
 *    - 同时去取新的放进去
 * 3. 多个同学同时要拿同一个东西时，只派一个人去取
 * 
 * 这就是SWR缓存策略的工作方式！
 */

import { Err, Ok, type Result } from "@unkey/error";
import type { Context } from "./context";
import { CacheError } from "./errors";
import type { Store } from "./stores";

/**
 * 单个命名空间的SWR缓存实现
 * 就像管理一个年级的储物柜区域
 */
export class SwrCache<TNamespace extends string, TValue> {
  private readonly ctx: Context;                 // 上下文环境
  private readonly store: Store<TNamespace, TValue | undefined>;  // 存储器
  private readonly fresh: number;                // 新鲜时间（毫秒）
  private readonly stale: number;                // 过期时间（毫秒）

  /**
   * 去重复获取的映射表
   * 防止多个同学同时去教室拿同一本书
   * 
   * 比如：小明和小红同时要拿数学书
   * - 只让小明去拿
   * - 小红等小明拿回来就行
   */
  private readonly revalidating: Map<string, Promise<TValue | undefined>> = new Map();

  constructor(
    ctx: Context,
    store: Store<TNamespace, TValue | undefined>,
    fresh: number,
    stale: number,
  ) {
    this.ctx = ctx;
    this.store = store;
    this.fresh = fresh;
    this.stale = stale;
  }

  /**
   * 获取缓存的值
   * 就像打开储物柜看里面有什么
   */
  public async get(
    namespace: TNamespace,
    key: string,
  ): Promise<Result<TValue | undefined, CacheError>> {
    const res = await this._get(namespace, key);
    if (res.err) {
      return Err(res.err);
    }
    return Ok(res.val.value);
  }

  /**
   * 内部获取方法
   * 除了获取值，还要检查是否需要更新
   * 
   * 就像检查储物柜里的东西：
   * 1. 如果储物柜是空的 -> 返回空
   * 2. 如果东西已经过期 -> 清空储物柜，返回空
   * 3. 如果东西不新鲜 -> 返回现有的，但标记需要更新
   * 4. 如果东西新鲜 -> 直接返回
   */
  private async _get(
    namespace: TNamespace,
    key: string,
  ): Promise<Result<{ value: TValue | undefined; revalidate?: boolean }, CacheError>> {
    const res = await this.store.get(namespace, key);
    if (res.err) {
      return Err(res.err);
    }

    const now = Date.now();
    
    // 储物柜是空的
    if (!res.val) {
      return Ok({ value: undefined });
    }

    // 东西已经过期了，需要清空储物柜
    if (now >= res.val.staleUntil) {
      this.ctx.waitUntil(this.remove(namespace, key));
      return Ok({ value: undefined });
    }

    // 东西不新鲜了，但还能用
    if (now >= res.val.freshUntil) {
      return Ok({ value: res.val.value, revalidate: true });
    }

    // 东西很新鲜
    return Ok({ value: res.val.value });
  }

  /**
   * 设置缓存的值
   * 
   * 就像把东西放进储物柜，并标记：
   * - 什么时候开始不新鲜
   * - 什么时候彻底过期
   */
  public async set(
    namespace: TNamespace,
    key: string,
    value: TValue | undefined,
    opts?: {
      fresh: number;  // 新鲜期（可选）
      stale: number;  // 过期期（可选）
    },
  ): Promise<Result<void, CacheError>> {
    const now = Date.now();
    return this.store.set(namespace, key, {
      value,
      freshUntil: now + (opts?.fresh ?? this.fresh),    // 不指定就用默认的新鲜期
      staleUntil: now + (opts?.stale ?? this.stale),    // 不指定就用默认的过期期
    });
  }

  /**
   * 移除缓存的值
   * 就像清空储物柜
   */
  public async remove(namespace: TNamespace, key: string): Promise<Result<void, CacheError>> {
    return this.store.remove(namespace, key);
  }

  /**
   * SWR模式获取
   * 这是最智能的获取方式！
   * 
   * 工作流程：
   * 1. 先看储物柜里有没有东西
   * 2. 如果有：
   *    - 如果不新鲜了，同时派人去拿新的
   *    - 但先返回现有的（不用等新的拿回来）
   * 3. 如果没有：
   *    - 立即去拿新的
   *    - 放进储物柜
   *    - 返回新拿的
   */
  public async swr(
    namespace: TNamespace,
    key: string,
    loadFromOrigin: (key: string) => Promise<TValue | undefined>,
  ): Promise<Result<TValue | undefined, CacheError>> {
    const res = await this._get(namespace, key);
    if (res.err) {
      return Err(res.err);
    }

    const { value, revalidate } = res.val;
    
    // 储物柜里有东西
    if (typeof value !== "undefined") {
      // 如果不新鲜了，后台去拿新的
      if (revalidate) {
        this.ctx.waitUntil(
          this.deduplicateLoadFromOrigin(namespace, key, loadFromOrigin).then((res) =>
            this.set(namespace, key, res),
          ),
        );
      }
      return Ok(value);  // 先返回现有的
    }

    // 储物柜是空的，要立即去拿新的
    try {
      const value = await this.deduplicateLoadFromOrigin(namespace, key, loadFromOrigin);
      this.ctx.waitUntil(this.set(namespace, key, value));
      return Ok(value);
    } catch (err) {
      return Err(
        new CacheError({
          tier: "cache",
          key,
          message: (err as Error).message,
        }),
      );
    }
  }

  /**
   * 去重复获取源数据
   * 
   * 就像多个同学同时要拿一本书：
   * 1. 先看有没有人已经去拿了
   * 2. 如果有人去拿了，就等他拿回来
   * 3. 如果没人去拿，就自己去拿
   * 4. 拿完后通知其他在等的同学
   */
  private async deduplicateLoadFromOrigin(
    namespace: TNamespace,
    key: string,
    loadFromOrigin: (key: string) => Promise<TValue | undefined>,
  ): Promise<TValue | undefined> {
    const revalidateKey = [namespace, key].join("::");
    try {
      // 看看有没有人已经去拿了
      const revalidating = this.revalidating.get(revalidateKey);
      if (revalidating) {
        return await revalidating;  // 有人去拿了，等他拿回来
      }

      // 没人去拿，自己去拿
      const p = loadFromOrigin(key);
      this.revalidating.set(revalidateKey, p);  // 记录下自己去拿了，避免其他人也去
      return await p;
    } finally {
      // 不管成功失败，都要删除"正在获取"的标记
      this.revalidating.delete(revalidateKey);
    }
  }
}
