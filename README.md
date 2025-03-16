<div align="center">
    <h1 align="center">Unkey</h1>
    <h5>Open Source API authentication and authorization</h5>
</div>

<div align="center">
  <a href="https://go.unkey.com">unkey.com</a>
</div>
<br/>

# 中文注释项目 (Chinese Comments Project)

为了提高代码的可理解性并方便中文开发者学习，我们正在为核心文件添加中文注释。目前进行的工作：

- [/packages/api/src/openapi.d.ts](packages/api/src/openapi.d.ts) - API类型定义文件的中文注释

# 代码阅读推荐顺序

## 1. 核心基础设施层

### 1.1 基础工具库

- [/internal/id/src/generate.ts](internal/id/src/generate.ts) - ID生成器实现 ✅
- [/internal/encryption/src/aes-gcm.ts](internal/encryption/src/aes-gcm.ts) - AES-GCM加密实现 ✅
- [/internal/encryption/src/key.ts](internal/encryption/src/key.ts) - 密钥管理实现 ✅
- [/internal/hash/src/sha256.ts](internal/hash/src/sha256.ts) - SHA256哈希算法 ✅
- [/internal/encoding/src/base64.ts](internal/encoding/src/base64.ts) - Base64编码工具 ✅
- [/internal/events/src/index.ts](internal/events/src/index.ts) - 事件系统 ✅

### 1.2 数据存储层

- [/internal/db/src/schema/keyAuth.ts](internal/db/src/schema/keyAuth.ts) - 主数据库模型定义 ✅
- [/internal/db/src/schema/keys.ts](internal/db/src/schema/keys.ts) - 密钥数据模型 ✅
- [/internal/db/src/schema/rbac.ts](internal/db/src/schema/rbac.ts) - 权限控制模型 ✅
- [/internal/db/drizzle/0000_cool_kulan_gath.sql](internal/db/drizzle/0000_cool_kulan_gath.sql) - 数据库迁移脚本 *
- [/internal/clickhouse/schema/001_create_databases.sql](internal/clickhouse/schema/001_create_databases.sql) - ClickHouse数据库初始化 *
- [/internal/clickhouse/schema/002_create_metrics_raw_api_requests_v1.sql](internal/clickhouse/schema/002_create_metrics_raw_api_requests_v1.sql) - API请求指标表 *

### 1.3 缓存系统

- [/packages/cache/src/cache.ts](packages/cache/src/cache.ts) - 缓存核心实现 ✅
- [/packages/cache/src/swr.ts](packages/cache/src/swr.ts) - SWR(stale-while-revalidate)策略 ✅
- [/packages/cache/src/tiered.ts](packages/cache/src/tiered.ts) - 多级缓存实现 ✅
- [/packages/cache/src/stores/memory.ts](packages/cache/src/stores/memory.ts) - 内存存储实现 ✅

### 1.4 错误处理

- [/packages/error/src/error-handling.ts](packages/error/src/error-handling.ts) - 错误处理核心 *
- [/packages/error/src/errors/database.ts](packages/error/src/errors/database.ts) - 数据库错误定义 *
- [/packages/error/src/errors/validation.ts](packages/error/src/errors/validation.ts) - 验证错误定义 *

### 1.5 Go服务基础框架

- [/go/pkg/fault/wrap.go](go/pkg/fault/wrap.go) - 错误包装器 *
- [/go/pkg/cache/cache.go](go/pkg/cache/cache.go) - Go缓存实现 *
- [/go/pkg/circuitbreaker/lib.go](go/pkg/circuitbreaker/lib.go) - 熔断器实现 *
- [/go/pkg/batch/process.go](go/pkg/batch/process.go) - 批处理框架 *
- [/go/pkg/discovery/redis.go](go/pkg/discovery/redis.go) - Redis服务发现 *

## 2. 核心业务功能层

### 2.1 API认证

- [/apps/api/src/routes/v1_keys_verifyKey.ts](apps/api/src/routes/v1_keys_verifyKey.ts) - 密钥验证接口 *
- [/apps/api/src/routes/v1_keys_createKey.ts](apps/api/src/routes/v1_keys_createKey.ts) - 密钥创建接口 *
- [/apps/api/src/pkg/auth/root_key.ts](apps/api/src/pkg/auth/root_key.ts) - Root密钥验证 *
- [/internal/keys/src/v1.ts](internal/keys/src/v1.ts) - 密钥管理核心逻辑 *

## 3. 核心认证与授权

- [/apps/api/src/pkg/auth/root_key.ts](apps/api/src/pkg/auth/root_key.ts) - 根密钥认证实现
- [/apps/api/src/routes/v1_keys_verifyKey.ts](apps/api/src/routes/v1_keys_verifyKey.ts) - 密钥验证API实现
- [/apps/docs/api-reference/authentication.mdx](apps/docs/api-reference/authentication.mdx) - API认证文档
- [/apps/docs/security/overview.mdx](apps/docs/security/overview.mdx) - 安全性设计说明

## 4. API密钥管理

- [/apps/api/src/routes/v1_keys_createKey.ts](apps/api/src/routes/v1_keys_createKey.ts) - 创建密钥API
- [/apps/api/src/routes/v1_keys_getKey.ts](apps/api/src/routes/v1_keys_getKey.ts) - 获取密钥详情API
- [/apps/api/src/routes/v1_keys_whoami.ts](apps/api/src/routes/v1_keys_whoami.ts) - 获取当前密钥信息API
- [/internal/db/src/schema/keyAuth.ts](internal/db/src/schema/keyAuth.ts) - 密钥认证数据模型

## 5. 权限与角色控制

- [/apps/docs/apis/features/authorization/introduction.mdx](apps/docs/apis/features/authorization/introduction.mdx) - RBAC介绍
- [/apps/docs/apis/features/authorization/example.mdx](apps/docs/apis/features/authorization/example.mdx) - RBAC使用示例
- [/apps/engineering/content/rfcs/0001-rbac.mdx](apps/engineering/content/rfcs/0001-rbac.mdx) - RBAC设计RFC

## 6. 速率限制实现

- [/apps/engineering/content/architecture/services/api/ratelimiting.mdx](apps/engineering/content/architecture/services/api/ratelimiting.mdx) - 速率限制架构设计
- [/apps/docs/apis/features/ratelimiting/modes.mdx](apps/docs/apis/features/ratelimiting/modes.mdx) - 速率限制模式说明
- [/apps/docs/ratelimiting/introduction.mdx](apps/docs/ratelimiting/introduction.mdx) - 速率限制功能概述
- [/apps/api/src/routes/v1_ratelimits_limit.ts](apps/api/src/routes/v1_ratelimits_limit.ts) - 速率限制API实现

## 7. 高级功能

- [/apps/docs/apis/features/remaining.mdx](apps/docs/apis/features/remaining.mdx) - 使用次数限制说明 *
- [/apps/docs/apis/features/revocation.mdx](apps/docs/apis/features/revocation.mdx) - 密钥吊销机制 *
- [/apps/docs/ratelimiting/automated-overrides.mdx](apps/docs/ratelimiting/automated-overrides.mdx) - 自动化覆盖规则 *

## 8. 集成示例

- [/apps/www/content/blog/using-unkey-with-auth.mdx](apps/www/content/blog/using-unkey-with-auth.mdx) - 认证服务集成指南
- [/apps/www/content/blog/secure-supabase-functions-using-unkey.mdx](apps/www/content/blog/secure-supabase-functions-using-unkey.mdx) - Supabase函数集成
- [/apps/www/content/blog/cli-auth.mdx](apps/www/content/blog/cli-auth.mdx) - CLI认证集成指南
- [/apps/www/content/blog/ratelimiting-otp.mdx](apps/www/content/blog/ratelimiting-otp.mdx) - OTP速率限制实践指南

## 9. 项目愿景与架构 *

- [/apps/www/content/blog/why-we-built-unkey.mdx](apps/www/content/blog/why-we-built-unkey.mdx) * - 项目愿景与功能概览
- [/apps/www/content/blog/vault.mdx](apps/www/content/blog/vault.mdx) * - 密钥恢复功能说明
- [/apps/www/content/blog/improve-auth-experience.mdx](apps/www/content/blog/improve-auth-experience.mdx) * - 认证体验优化指南

## 10. 微服务架构

### 10.1 API 网关服务

- [/apps/api/src/routes/](apps/api/src/routes/) - API路由实现 *
- [/apps/api/src/pkg/](apps/api/src/pkg/) - 核心业务逻辑 *
- [/apps/api/src/schema/](apps/api/src/schema/) - API请求响应模型 *

### 10.2 边缘计算服务

- [/apps/agent/cmd/main.go](apps/agent/cmd/main.go) - Agent服务入口点 *
- [/apps/agent/pkg/proxy/cache.go](apps/agent/pkg/proxy/cache.go) - 代理缓存实现 *
- [/apps/agent/pkg/proxy/proxy.go](apps/agent/pkg/proxy/proxy.go) - 代理转发核心逻辑 *
- [/apps/agent/pkg/metrics/collector.go](apps/agent/pkg/metrics/collector.go) - 指标收集器 *
- [/apps/agent/proto/agent.proto](apps/agent/proto/agent.proto) - 服务接口定义 *
- [/apps/agent/config.production.json](apps/agent/config.production.json) - 生产环境配置 *

### 10.3 ClickHouse代理服务

- [/apps/chproxy/main.go](apps/chproxy/main.go) - 代理服务入口 *
- [/apps/chproxy/config.go](apps/chproxy/config.go) - 配置管理 *
- [/apps/chproxy/buffer.go](apps/chproxy/buffer.go) - 缓冲区实现 *

### 10.4 计费服务

- [/apps/billing/src/index.ts](apps/billing/src/index.ts) - 计费服务入口 *
- [/apps/billing/src/schema/](apps/billing/src/schema/) - 计费数据模型 *
- [/internal/billing/src/](internal/billing/src/) - 计费核心逻辑 *

### 10.5 日志服务

- [/apps/logdrain/src/index.ts](apps/logdrain/src/index.ts) - 日志服务入口 *
- [/internal/logs/src/](internal/logs/src/) - 日志处理实现 *
- [/internal/worker-logging/src/](internal/worker-logging/src/) - Worker日志模块 *

## 11. 前端应用

### 11.1 控制台应用

- [/apps/dashboard/app/layout.tsx](apps/dashboard/app/layout.tsx) - 应用布局与路由 *
- [/apps/dashboard/app/page.tsx](apps/dashboard/app/page.tsx) - 主页面实现 *
- [/apps/dashboard/components/](apps/dashboard/components/) - 共享组件库 *
- [/apps/dashboard/lib/](apps/dashboard/lib/) - 工具函数库 *

### 11.2 官网

- [/apps/www/app/](apps/www/app/) - Next.js应用入口 *
- [/apps/www/content/](apps/www/content/) - 内容管理 *
- [/apps/www/components/](apps/www/components/) - UI组件库 *

### 11.3 文档中心

- [/apps/docs/apis/](apps/docs/apis/) - API文档 *
- [/apps/docs/quickstart/](apps/docs/quickstart/) - 快速入门指南 *
- [/apps/docs/concepts/](apps/docs/concepts/) - 核心概念解释 *
- [/apps/docs/integrations/](apps/docs/integrations/) - 第三方集成文档 *

### 11.4 工程文档

- [/apps/engineering/content/architecture/](apps/engineering/content/architecture/) - 系统架构文档 *
- [/apps/engineering/content/rfcs/](apps/engineering/content/rfcs/) - RFC提案文档 *
- [/apps/engineering/content/contributing/](apps/engineering/content/contributing/) - 贡献指南 *

## Contributing

Please read through our [contributing guide](.github/CONTRIBUTING.md) before starting any work.

## Let's talk

<a href="https://cal.com/team/unkey/user-interview?utm_source=banner&utm_campaign=oss"><img alt="Book us with Cal.com" src="https://cal.com/book-with-cal-dark.svg" /></a>

## Authors

<a href="https://github.com/unkeyed/unkey/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=unkeyed/unkey" />
</a>

## Stats

![Alt](https://repobeats.axiom.co/api/embed/7fffcb5e94fd0a27b9c4d6ffe2d7e3261da2d0e4.svg "Repobeats analytics image")
