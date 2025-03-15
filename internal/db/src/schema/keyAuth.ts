/**
 * @fileoverview 密钥认证服务数据模型定义
 * 
 * 该文件定义了密钥认证服务(KeyAuth)的数据库模型，它是Unkey系统中的核心数据结构之一。
 * KeyAuth服务负责：
 * 1. 管理API密钥的创建和存储策略
 * 2. 维护密钥空间的配置信息
 * 3. 跟踪密钥数量和使用情况
 * 4. 关联工作区、API和具体的密钥
 */

import { relations } from "drizzle-orm";
import { bigint, boolean, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { apis } from "./apis";
import { keys } from "./keys";
import { lifecycleDatesMigration } from "./util/lifecycle_dates";
import { workspaces } from "./workspaces";

/**
 * 密钥认证服务表定义
 * 存储密钥服务的配置信息和统计数据
 */
export const keyAuth = mysqlTable("key_auth", {
  // 唯一标识符
  id: varchar("id", { length: 256 }).primaryKey(),
  
  // 所属工作区ID
  workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
  
  // 生命周期日期（创建时间、更新时间等）
  ...lifecycleDatesMigration,
  
  // 是否存储加密的密钥原文
  // 启用后可以通过Vault服务恢复显示原始密钥
  storeEncryptedKeys: boolean("store_encrypted_keys").notNull().default(false),
  
  // 默认密钥前缀
  // 如sk_live_表示生产环境密钥
  defaultPrefix: varchar("default_prefix", { length: 8 }),
  
  // 默认密钥字节长度
  // 影响密钥的安全性和长度，默认16字节（128位）
  defaultBytes: int("default_bytes").default(16),
  
  /**
   * 当前密钥空间中的密钥数量
   * 这是一个近似值，在sizeLastUpdatedAt时间点是准确的
   * 如果sizeLastUpdatedAt超过1分钟，需要重新统计并更新此字段
   */
  sizeApprox: int("size_approx").notNull().default(0),
  
  // 最后一次更新大小的时间戳
  sizeLastUpdatedAt: bigint("size_last_updated_at", { mode: "number" }).notNull().default(0),
});

/**
 * 定义与其他表的关系
 * 使用Drizzle ORM的关系API
 */
export const keyAuthRelations = relations(keyAuth, ({ one, many }) => ({
  // 一对一关系：每个KeyAuth服务属于一个工作区
  workspace: one(workspaces, {
    fields: [keyAuth.workspaceId],
    references: [workspaces.id],
  }),
  
  // 一对一关系：每个KeyAuth服务关联一个API
  api: one(apis, {
    fields: [keyAuth.id],
    references: [apis.keyAuthId],
  }),
  
  // 一对多关系：每个KeyAuth服务可以管理多个密钥
  keys: many(keys),
}));
