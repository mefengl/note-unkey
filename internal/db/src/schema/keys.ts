/**
 * 密钥管理数据模型
 * 
 * 想象一下图书馆的借书证系统：
 * 1. 每个同学有一张独特的借书证（密钥）
 * 2. 借书证上有很多信息：
 *    - 学生的姓名和班级
 *    - 可以借多少本书
 *    - 什么时候过期
 *    - 是否被暂停使用
 * 
 * 这个数据模型就类似于管理这些借书证的系统！
 */

import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { identities, ratelimits } from "./identity";
import { keyAuth } from "./keyAuth";
import { keysPermissions, keysRoles } from "./rbac";
import { embeddedEncrypted } from "./util/embedded_encrypted";
import { lifecycleDatesMigration, lifecycleDatesV2 } from "./util/lifecycle_dates";
import { workspaces } from "./workspaces";

/**
 * 密钥表 - 存储所有API密钥的信息
 * 就像图书馆的借书证登记表
 */
export const keys = mysqlTable(
  "keys",
  {
    // 密钥的唯一标识符，就像借书证号码
    id: varchar("id", { length: 256 }).primaryKey(),
    
    // 关联的认证服务ID，就像是哪个图书馆发的借书证
    keyAuthId: varchar("key_auth_id", { length: 256 }).notNull(),
    
    // 密钥的哈希值，用于验证密钥是否正确
    // 就像借书证上的防伪标记
    hash: varchar("hash", { length: 256 }).notNull(),
    
    // 密钥的开始部分，用于快速查找
    // 就像借书证号码的前几位数字
    start: varchar("start", { length: 256 }).notNull(),
    
    // 所属工作区ID，就像是哪个学校的学生
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    
    // 特殊用途：内部密钥的目标工作区
    // 就像图书馆管理员的特殊证件
    forWorkspaceId: varchar("for_workspace_id", { length: 256 }),
    
    // 密钥的名称，方便识别用途
    // 就像在借书证上写上"暑假读书卡"
    name: varchar("name", { length: 256 }),
    
    // 拥有者ID，就像学生的学号
    ownerId: varchar("owner_id", { length: 256 }),
    
    // 身份ID，用于更细致的身份管理
    // 就像把学生分成不同的班级
    identityId: varchar("identity_id", { length: 256 }),
    
    // 额外信息，可以存储任何相关的数据
    // 就像借书证上的备注栏
    meta: text("meta"),
    
    // 过期时间，就像借书证的有效期
    expires: datetime("expires", { fsp: 3 }),
    
    // 继承生命周期日期字段（创建时间、更新时间等）
    ...lifecycleDatesMigration,
    
    /**
     * 使用次数自动补充设置
     * 就像每个月自动给借书证增加可借阅次数
     */
    // 哪天补充：1表示每月1号，31表示每月最后一天
    refillDay: tinyint("refill_day"),
    // 补充多少次使用次数
    refillAmount: int("refill_amount"),
    // 上次补充的时间
    lastRefillAt: datetime("last_refill_at", { fsp: 3 }),
    
    /**
     * 密钥是否启用
     * 就像借书证是否被暂停使用
     */
    enabled: boolean("enabled").default(true).notNull(),
    
    /**
     * 剩余可使用次数
     * 就像借书证还能借几本书
     */
    remaining: int("remaining_requests"),
    
    /**
     * 速率限制设置
     * 就像限制学生一天最多能借几本书
     */
    // 是否异步检查速率限制
    ratelimitAsync: boolean("ratelimit_async"),
    // 最大请求数量
    ratelimitLimit: int("ratelimit_limit"),
    // 时间周期（毫秒）
    ratelimitDuration: bigint("ratelimit_duration", { mode: "number" }),
    
    /**
     * 环境标记
     * 就像区分"练习卡"和"正式卡"
     */
    environment: varchar("environment", { length: 256 }),
  },
  // 设置索引，帮助快速查找密钥
  // 就像图书馆的卡片目录系统
  (table) => ({
    hashIndex: uniqueIndex("hash_idx").on(table.hash),
    keyAuthAndDeletedIndex: index("key_auth_id_deleted_at_idx").on(
      table.keyAuthId,
      table.deletedAtM,
    ),
    forWorkspaceIdIndex: index("idx_keys_on_for_workspace_id").on(table.forWorkspaceId),
    ownerIdIndex: index("owner_id_idx").on(table.ownerId),
    identityIdIndex: index("identity_id_idx").on(table.identityId),
    deletedIndex: index("deleted_at_idx").on(table.deletedAtM),
  }),
);

/**
 * 定义密钥表与其他表的关系
 * 就像描述借书证和图书馆其他系统的关联
 */
export const keysRelations = relations(keys, ({ one, many }) => ({
  // 关联认证服务
  keyAuth: one(keyAuth, {
    fields: [keys.keyAuthId],
    references: [keyAuth.id],
  }),
  // 关联所属工作区
  workspace: one(workspaces, {
    relationName: "workspace_key_relation",
    fields: [keys.workspaceId],
    references: [workspaces.id],
  }),
  // 关联目标工作区（仅用于内部密钥）
  forWorkspace: one(workspaces, {
    fields: [keys.forWorkspaceId],
    references: [workspaces.id],
  }),
  // 关联权限
  permissions: many(keysPermissions, {
    relationName: "keys_keys_permissions_relations",
  }),
  // 关联角色
  roles: many(keysRoles, {
    relationName: "keys_roles_key_relations",
  }),
  // 关联加密数据
  encrypted: one(encryptedKeys),
  // 关联速率限制
  ratelimits: many(ratelimits),
  // 关联身份
  identity: one(identities, {
    fields: [keys.identityId],
    references: [identities.id],
  }),
}));

/**
 * 加密密钥表
 * 存储被加密保存的密钥原文
 * 
 * 就像图书馆保存借书证复印件的保险柜：
 * - 不是每个借书证都需要保存复印件
 * - 复印件要加密保存，确保安全
 */
export const encryptedKeys = mysqlTable(
  "encrypted_keys",
  {
    // 所属工作区
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    // 关联的密钥ID
    keyId: varchar("key_id", { length: 256 }).notNull(),
    // 生命周期日期
    ...lifecycleDatesV2,
    // 加密相关字段
    ...embeddedEncrypted,
  },
  (table) => ({
    // 确保每个密钥只有一条加密记录
    onePerKey: uniqueIndex("key_id_idx").on(table.keyId),
  }),
);

/**
 * 加密密钥表的关联关系
 */
export const encryptedKeysRelations = relations(encryptedKeys, ({ one }) => ({
  // 关联原始密钥
  key: one(keys, {
    fields: [encryptedKeys.keyId],
    references: [keys.id],
  }),
  // 关联工作区
  workspace: one(workspaces, {
    fields: [encryptedKeys.workspaceId],
    references: [workspaces.id],
  }),
}));
