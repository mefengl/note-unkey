/**
 * 缓存系统
 * 
 * 想象一下学校的储物柜系统：
 * 1. 不同年级有不同的储物柜区域（命名空间）
 * 2. 每个储物柜都有编号（键）和内容（值）
 * 3. 可以存东西、拿东西、更换内容
 * 
 * 这个模块就是管理这样的"储物柜系统"！
 */

import type { Cache } from "./interface";
import type { Namespace } from "./namespace";

/**
 * 创建缓存系统的工厂函数
 * 
 * 就像学校管理员设置不同年级的储物柜区域：
 * - 一年级区域：放书包
 * - 二年级区域：放体育用品
 * - 三年级区域：放美术用品
 * 
 * @param namespaces - 不同区域的配置
 * @returns 返回一个完整的缓存系统
 * 
 * 使用示例：
 * const cache = createCache({
 *   users: userNamespace,    // 用户数据区
 *   products: prodNamespace, // 产品数据区
 *   orders: orderNamespace   // 订单数据区
 * });
 */
export function createCache<
  TNamespaces extends Record<string, unknown>,
  TNamespace extends keyof TNamespaces = keyof TNamespaces,
>(
  namespaces: {
    [TName in keyof TNamespaces]: Namespace<TNamespaces[TName]>;
  },
): Cache<TNamespaces> {
  // 把每个命名空间转换成标准的缓存操作接口
  return Object.entries(namespaces).reduce(
    (acc, [n, c]) => {
      // 为每个命名空间创建四个基本操作
      acc[n as TNamespace] = {
        // 获取数据，就像打开储物柜看里面有什么
        get: (key) => c.get(n, key),
        
        // 存储数据，就像把东西放进储物柜
        // opts可以设置数据的新鲜度和过期时间
        set: (key, value, opts) => c.set(n, key, value, opts),
        
        // 删除数据，就像清空储物柜
        remove: (key) => c.remove(n, key),
        
        // SWR(stale-while-revalidate)模式
        // 就像："先看储物柜里有没有，没有就去教室拿，
        // 或者有但太旧了就用旧的先用着，同时去拿新的"
        swr: (key, loadFromOrigin) => c.swr(n, key, loadFromOrigin),
      };
      return acc;
    },
    {} as Cache<TNamespaces>,
  );
}
