/**
 * 多级缓存系统
 * 
 * 想象一个学校的多级储存系统：
 * 1. 教室里的储物柜（最快取用，但空间小）
 * 2. 走廊的公共储物柜（稍慢一点，空间大）
 * 3. 图书馆的储藏室（最慢，但空间最大）
 * 
 * 查找东西时：
 * 1. 先看教室储物柜
 * 2. 没有就看走廊储物柜
 * 3. 还没有就去图书馆储藏室
 * 4. 在任何地方找到后，都会在更近的地方存一份
 */

import { Err, Ok, type Result } from "@unkey/error";
import type { Context } from "./context";
import { CacheError } from "./errors";
import type { Entry, Store } from "./stores";

/**
 * 多级缓存存储器
 * 会按顺序检查所有缓存级别，找到后会填充到更快的级别
 */
export class TieredStore<TNamespace extends string, TValue> implements Store<TNamespace, TValue> {
  private ctx: Context;
  private readonly tiers: Store<TNamespace, TValue>[];  // 缓存级别列表
  public readonly name = "tiered";

  /**
   * 创建新的多级缓存存储器
   * 
   * 就像设置学校的储存系统：
   * - 第一级：教室储物柜（内存缓存）
   * - 第二级：走廊储物柜（Redis缓存）
   * - 第三级：图书馆储藏室（磁盘存储）
   * 
   * stores参数可以包含undefined，方便动态配置：
   * @example
   * ```ts
   * new TieredStore(ctx, [
   *   new MemoryStore(..),               // 内存缓存永远开启
   *   开启Redis ? new RedisStore(..) : undefined  // Redis可选
   * ])
   * ```
   */
  constructor(ctx: Context, stores: (Store<TNamespace, TValue> | undefined)[]) {
    this.ctx = ctx;
    this.tiers = stores.filter(Boolean) as Store<TNamespace, TValue>[];
  }

  /**
   * 获取缓存的值
   * 
   * 工作流程：
   * 1. 先看最快的缓存（比如教室储物柜）
   * 2. 没找到就看下一级（比如走廊储物柜）
   * 3. 在任何地方找到后：
   *    - 返回找到的值
   *    - 同时在更快的地方也存一份
   * 
   * 返回值：
   * - undefined：表示所有级别都没找到
   * - null：表示确认不存在这个东西
   */
  public async get(
    namespace: TNamespace,
    key: string,
  ): Promise<Result<Entry<TValue> | undefined, CacheError>> {
    // 如果没有配置任何缓存级别
    if (this.tiers.length === 0) {
      return Ok(undefined);
    }

    // 从快到慢依次检查每个缓存级别
    for (let i = 0; i < this.tiers.length; i++) {
      const res = await this.tiers[i].get(namespace, key);
      if (res.err) {
        return res;
      }

      // 在这一级找到了
      if (typeof res.val !== "undefined") {
        // 在后台把值存到所有更快的级别
        // 比如在图书馆找到了，就在走廊和教室也放一份
        this.ctx.waitUntil(
          Promise.all(
            this.tiers.filter((_, j) => j < i).map((t) => () => t.set(namespace, key, res.val!)),
          ).catch((err) => {
            return Err(
              new CacheError({
                tier: this.name,
                key,
                message: (err as Error).message,
              }),
            );
          }),
        );
        return Ok(res.val);
      }
    }

    // 所有级别都没找到
    return Ok(undefined);
  }

  /**
   * 设置缓存的值
   * 
   * 就像在所有储存地方都放一份：
   * - 教室里放一份
   * - 走廊里放一份
   * - 图书馆里放一份
   */
  public async set(
    namespace: TNamespace,
    key: string,
    value: Entry<TValue>,
  ): Promise<Result<void, CacheError>> {
    return Promise.all(this.tiers.map((t) => t.set(namespace, key, value)))
      .then(() => Ok())
      .catch((err) =>
        Err(
          new CacheError({
            tier: this.name,
            key,
            message: (err as Error).message,
          }),
        ),
      );
  }

  /**
   * 移除缓存的值
   * 
   * 就像把所有地方的副本都清理掉：
   * - 教室里的拿走
   * - 走廊里的拿走
   * - 图书馆里的也拿走
   */
  public async remove(namespace: TNamespace, key: string): Promise<Result<void, CacheError>> {
    return Promise.all(this.tiers.map((t) => t.remove(namespace, key)))
      .then(() => Ok())
      .catch((err) =>
        Err(
          new CacheError({
            tier: this.name,
            key,
            message: (err as Error).message,
          }),
        ),
      );
  }
}
