/**
 * 事件系统
 * 
 * 想象一下学校的广播系统：
 * 1. 有不同类型的广播（上课铃、下课铃、课间音乐...）
 * 2. 每种广播都有特定的格式（比如铃声持续时间、音量大小）
 * 3. 所有人都能听到广播，但每个人可以选择是否要对广播作出反应
 * 
 * 这个事件系统就类似于学校的广播系统：
 * - 不同类型的事件就像不同类型的广播
 * - 每个事件都有固定的数据格式
 * - 其他程序可以"监听"并响应这些事件
 */

import { z } from "zod";

/**
 * 事件类型列表
 * 就像学校广播的类型列表：
 * - 上课铃
 * - 下课铃
 * - 课间音乐
 * ...等等
 */
export const eventTypesArr = [
  "verifications.usage.record",  // 记录API密钥使用情况的事件
  "xx"                          // 预留的事件类型
] as const;

/**
 * 事件类型的格式检查器
 * 就像确保广播类型是正确的，不能播放一个不存在的广播类型
 */
export const eventType = z.enum(eventTypesArr);

/**
 * 事件的具体格式定义
 * 就像定义每种广播需要包含什么信息：
 * 
 * 比如"上课铃"广播需要包含：
 * - 是第几节课
 * - 哪个年级
 * - 什么时间
 */
export const event = z.discriminatedUnion("type", [
  z.object({
    // 事件类型：记录API密钥使用情况
    type: z.literal(eventType.enum["verifications.usage.record"]),
    
    // 事件发生的时间
    timestamp: z.string().datetime(),
    
    // 事件的具体内容
    data: z.object({
      // 事件的唯一标识符
      eventId: z.string(),
      
      // 统计的时间范围
      interval: z.object({
        start: z.number(),  // 开始时间
        end: z.number(),    // 结束时间
      }),
      
      // 密钥空间的ID
      keySpaceId: z.string(),
      
      // 使用记录列表
      records: z.array(
        z.object({
          ownerId: z.string(),     // 谁在使用
          verifications: z.number(), // 使用了多少次
        }),
      ),
    }),
  }),
]);

/**
 * 导出事件类型
 * 这样其他程序就知道每种事件包含什么信息
 */
export type Event = z.infer<typeof event>;
