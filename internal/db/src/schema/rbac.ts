/**
 * 权限和角色管理系统
 * 
 * 想象一下学校的出入证系统：
 * 1. 权限(Permission)：具体的权利，比如"可以进图书馆"、"可以使用实验室"
 * 2. 角色(Role)：一组权限的集合，比如"普通学生"、"班长"、"实验室助手"
 * 3. 证件(Key)：可以分配权限和角色，就像学生证或特殊通行证
 * 
 * 这个系统就是管理谁可以做什么的数据库结构！
 */

import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  mysqlTable,
  primaryKey,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { keys } from "./keys";
import { workspaces } from "./workspaces";

/**
 * 权限表
 * 定义所有可能的权限，比如：
 * - "可以进图书馆"
 * - "可以使用实验室"
 * - "可以参加课外活动"
 */
export const permissions = mysqlTable(
  "permissions",
  {
    // 权限的唯一标识符
    id: varchar("id", { length: 256 }).primaryKey(),
    
    // 所属工作区，就像是哪个学校的权限
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    
    // 权限名称，比如"使用实验室"
    name: varchar("name", { length: 512 }).notNull(),
    
    // 权限说明，比如"可以在课余时间使用物理实验室"
    description: varchar("description", { length: 512 }),
    
    // 创建和更新时间
    createdAtM: bigint("created_at_m", { mode: "number" })
      .notNull()
      .default(0)
      .$defaultFn(() => Date.now()),
    updatedAtM: bigint("updated_at_m", { mode: "number" }).$onUpdateFn(() => Date.now()),
  },
  // 设置索引，确保权限名称在同一个工作区内不重复
  (table) => {
    return {
      workspaceIdIdx: index("workspace_id_idx").on(table.workspaceId),
      uniqueNamePerWorkspaceIdx: unique("unique_name_per_workspace_idx").on(
        table.name,
        table.workspaceId,
      ),
    };
  },
);

/**
 * 权限关联关系
 * 描述权限和其他对象（工作区、密钥、角色）的关系
 */
export const permissionsRelations = relations(permissions, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [permissions.workspaceId],
    references: [workspaces.id],
  }),
  keys: many(keysPermissions, {
    relationName: "permissions_keys_permissions_relations",
  }),
  roles: many(rolesPermissions, {
    relationName: "roles_permissions",
  }),
}));

/**
 * 密钥-权限关联表
 * 记录哪些密钥有哪些直接权限
 * 
 * 就像记录"张三的学生证可以进入图书馆"这样的信息
 */
export const keysPermissions = mysqlTable(
  "keys_permissions",
  {
    // 临时ID，用于内部引用
    tempId: bigint("temp_id", { mode: "number" }).autoincrement().notNull(),
    
    // 密钥ID，就像"张三的学生证号码"
    keyId: varchar("key_id", { length: 256 }).notNull(),
    
    // 权限ID，就像"进入图书馆的权限代码"
    permissionId: varchar("permission_id", { length: 256 }).notNull(),
    
    // 所属工作区
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    
    // 创建和更新时间
    createdAtM: bigint("created_at_m", { mode: "number" })
      .notNull()
      .default(0)
      .$defaultFn(() => Date.now()),
    updatedAtM: bigint("updated_at_m", { mode: "number" }).$onUpdateFn(() => Date.now()),
  },
  // 设置约束，确保同一个密钥不会重复分配同一个权限
  (table) => {
    return {
      keysPermissionsKeyIdPermissionIdWorkspaceId: primaryKey({
        columns: [table.keyId, table.permissionId, table.workspaceId],
        name: "keys_permissions_key_id_permission_id_workspace_id",
      }),
      keysPermissionsTempIdUnique: unique("keys_permissions_temp_id_unique").on(table.tempId),
      keyIdPermissionIdIdx: unique("key_id_permission_id_idx").on(table.keyId, table.permissionId),
    };
  },
);

/**
 * 密钥-权限关联关系
 */
export const keysPermissionsRelations = relations(keysPermissions, ({ one }) => ({
  key: one(keys, {
    fields: [keysPermissions.keyId],
    references: [keys.id],
    relationName: "keys_keys_permissions_relations",
  }),
  permission: one(permissions, {
    fields: [keysPermissions.permissionId],
    references: [permissions.id],
    relationName: "permissions_keys_permissions_relations",
  }),
}));

/**
 * 角色表
 * 定义不同的角色，比如：
 * - "普通学生"
 * - "班长"
 * - "实验室助手"
 */
export const roles = mysqlTable(
  "roles",
  {
    // 角色的唯一标识符
    id: varchar("id", { length: 256 }).primaryKey(),
    
    // 所属工作区
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    
    // 角色名称，比如"实验室助手"
    name: varchar("name", { length: 512 }).notNull(),
    
    // 角色说明，比如"负责管理实验室设备的学生助手"
    description: varchar("description", { length: 512 }),
    
    // 创建和更新时间
    createdAtM: bigint("created_at_m", { mode: "number" })
      .notNull()
      .default(0)
      .$defaultFn(() => Date.now()),
    updatedAtM: bigint("updated_at_m", { mode: "number" }).$onUpdateFn(() => Date.now()),
  },
  // 设置索引，确保角色名称在同一个工作区内不重复
  (table) => {
    return {
      workspaceIdIdx: index("workspace_id_idx").on(table.workspaceId),
      uniqueNamePerWorkspaceIdx: unique("unique_name_per_workspace_idx").on(
        table.name,
        table.workspaceId,
      ),
    };
  },
);

/**
 * 角色关联关系
 * 描述角色和其他对象（工作区、密钥、权限）的关系
 */
export const rolesRelations = relations(roles, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [roles.workspaceId],
    references: [workspaces.id],
  }),
  keys: many(keysRoles, {
    relationName: "keys_roles_roles_relations",
  }),
  permissions: many(rolesPermissions, {
    relationName: "roles_rolesPermissions",
  }),
}));

/**
 * 角色-权限关联表
 * 记录每个角色包含哪些权限
 * 
 * 比如："实验室助手"这个角色包含：
 * - "使用实验室"权限
 * - "管理设备"权限
 */
export const rolesPermissions = mysqlTable(
  "roles_permissions",
  {
    // 角色ID
    roleId: varchar("role_id", { length: 256 }).notNull(),
    
    // 权限ID
    permissionId: varchar("permission_id", { length: 256 }).notNull(),
    
    // 所属工作区
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    
    // 创建和更新时间
    createdAtM: bigint("created_at_m", { mode: "number" })
      .notNull()
      .default(0)
      .$defaultFn(() => Date.now()),
    updatedAtM: bigint("updated_at_m", { mode: "number" }).$onUpdateFn(() => Date.now()),
  },
  // 设置约束，确保同一个角色不会重复分配同一个权限
  (table) => {
    return {
      rolesPermissionsRoleIdPermissionIdWorkspaceId: primaryKey({
        columns: [table.roleId, table.permissionId, table.workspaceId],
        name: "roles_permissions_role_id_permission_id_workspace_id",
      }),
      uniqueTuplePermissionIdRoleId: unique("unique_tuple_permission_id_role_id").on(
        table.permissionId,
        table.roleId,
      ),
    };
  },
);

/**
 * 角色-权限关联关系
 */
export const rolesPermissionsRelations = relations(rolesPermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolesPermissions.roleId],
    references: [roles.id],
    relationName: "roles_rolesPermissions",
  }),
  permission: one(permissions, {
    fields: [rolesPermissions.permissionId],
    references: [permissions.id],
    relationName: "roles_permissions",
  }),
}));

/**
 * 密钥-角色关联表
 * 记录哪些密钥被分配了哪些角色
 * 
 * 比如："张三的学生证"被分配了"实验室助手"这个角色
 */
export const keysRoles = mysqlTable(
  "keys_roles",
  {
    // 密钥ID
    keyId: varchar("key_id", { length: 256 }).notNull(),
    
    // 角色ID
    roleId: varchar("role_id", { length: 256 }).notNull(),
    
    // 所属工作区
    workspaceId: varchar("workspace_id", { length: 256 }).notNull(),
    
    // 创建和更新时间
    createdAtM: bigint("created_at_m", { mode: "number" })
      .notNull()
      .default(0)
      .$defaultFn(() => Date.now()),
    updatedAtM: bigint("updated_at_m", { mode: "number" }).$onUpdateFn(() => Date.now()),
  },
  // 设置约束，确保同一个密钥不会重复分配同一个角色
  (table) => {
    return {
      keysRolesRoleIdKeyIdWorkspaceId: primaryKey({
        columns: [table.roleId, table.keyId, table.workspaceId],
        name: "keys_roles_role_id_key_id_workspace_id",
      }),
      uniqueKeyIdRoleId: uniqueIndex("unique_key_id_role_id").on(table.keyId, table.roleId),
    };
  },
);

/**
 * 密钥-角色关联关系
 */
export const keysRolesRelations = relations(keysRoles, ({ one }) => ({
  role: one(roles, {
    fields: [keysRoles.roleId],
    references: [roles.id],
    relationName: "keys_roles_roles_relations",
  }),
  key: one(keys, {
    fields: [keysRoles.keyId],
    references: [keys.id],
    relationName: "keys_roles_key_relations",
  }),
}));
