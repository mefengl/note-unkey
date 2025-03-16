/**
 * 内存存储实现
 * 
 * 想象教室里的储物柜管理：
 * 1. 空间最小但最快（就像教室里的储物柜）
 * 2. 会定期清理过期的东西
 * 3. 超出容量时会清理最早放入的东西
 * 
 * 这就像一个智能的教室储物柜管理系统！
 */

import { Ok, type Result } from "@unkey/error";
import type { CacheError } from "../errors";
import type { Entry, Store } from "./interface";

/**
 * 内存存储配置选项
 * 就像设置储物柜的管理规则
 */
export type MemoryStoreConfig<TValue> = {
  /**
   * 在存放新物品时是否清理过期物品
   * 
   * 就像：每次有同学放东西时，检查一下有没有过期需要清理的
   * 
   * 注意：这个功能还在试验中，可能会改变或删除
   */
  unstableEvictOnSet?: {
    /**
     * 多久检查一次，用0到1之间的数字表示
     * 
     * 比如：
     * - 1：每次都检查（每次有人放东西都查看）
     * - 0.5：每两次检查一次（每两个人放东西才查看一次）
     * - 0或undefined：不检查（从不主动查看）
     */
    frequency: number;

    /**
     * 最大物品数量
     * 超过这个数量就要清理一些旧的
     */
    maxItems: number;
  };

  /**
   * 持久化的数据存储
   * 就像储物柜的实际空间
   */
  persistentMap: Map<string, TValue>;
};

/**
 * 内存存储器实现
 * 管理教室里的储物柜
 */
export class MemoryStore<TNamespace extends string, TValue = any>
  implements Store<TNamespace, TValue>
{
  /**
   * 存储空间
   * 储存格式：{ 过期时间, 实际内容 }
   */
  private readonly state: Map<string, { expires: number; entry: Entry<TValue> }>;
  
  /**
   * 清理规则设置
   */
  private readonly unstableEvictOnSet?: { frequency: number; maxItems: number };
  
  /**
   * 存储器名称
   */
  public readonly name = "memory";

  constructor(config: MemoryStoreConfig<{ expires: number; entry: Entry<TValue> }>) {
    this.state = config.persistentMap;
    this.unstableEvictOnSet = config.unstableEvictOnSet;
  }

  /**
   * 生成缓存键
   * 就像给储物柜编号：比如"一年级::小明的柜子"
   */
  private buildCacheKey(namespace: TNamespace, key: string): string {
    return [namespace, key].join("::");
  }

  /**
   * 获取存储的值
   * 
   * 检查流程：
   * 1. 找到储物柜
   * 2. 如果柜子是空的，返回空
   * 3. 如果东西过期了，清理掉并返回空
   * 4. 返回柜子里的东西
   */
  public async get(
    namespace: TNamespace,
    key: string,
  ): Promise<Result<Entry<TValue> | undefined, CacheError>> {
    const value = this.state.get(this.buildCacheKey(namespace, key));
    if (!value) {
      return Promise.resolve(Ok(undefined));
    }
    if (value.expires <= Date.now()) {
      await this.remove(namespace, key);
    }
    return Promise.resolve(Ok(value.entry));
  }

  /**
   * 存储值
   * 
   * 存储流程：
   * 1. 把东西放进储物柜
   * 2. 如果开启了自动清理：
   *    - 先清理所有过期的东西
   *    - 如果还是太满，就把最早放进去的拿出来
   */
  public async set(
    namespace: TNamespace,
    key: string,
    entry: Entry<TValue>,
  ): Promise<Result<void, CacheError>> {
    // 放入新物品
    this.state.set(this.buildCacheKey(namespace, key), {
      expires: entry.staleUntil,
      entry,
    });

    // 如果需要清理，并且到了检查的时间
    if (this.unstableEvictOnSet && Math.random() < this.unstableEvictOnSet.frequency) {
      // 第一步：清理所有过期的
      const now = Date.now();
      this.state.forEach((value, key, map) => {
        if (value.expires < now) {
          map.delete(key);
        }
      });

      // 第二步：如果还是太满，清理最早放入的
      for (const [k] of this.state) {
        if (this.state.size <= this.unstableEvictOnSet!.maxItems) {
          break;
        }
        this.state.delete(k);
      }
    }

    return Promise.resolve(Ok());
  }

  /**
   * 移除存储的值
   * 
   * 就像清空储物柜：
   * - 可以清空一个储物柜
   * - 也可以一次清空多个储物柜
   */
  public async remove(
    namespace: TNamespace,
    keys: string | string[],
  ): Promise<Result<void, CacheError>> {
    // 把所有要清理的柜子编号整理好
    const cacheKeys = (Array.isArray(keys) ? keys : [keys]).map((key) =>
      this.buildCacheKey(namespace, key).toString(),
    );

    // 一个个清理
    for (const key of cacheKeys) {
      this.state.delete(key);
    }

    return Promise.resolve(Ok());
  }
}
