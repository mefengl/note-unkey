<div align="center">
    <h1 align="center">Unkey</h1>
    <h5>Open Source API authentication and authorization</h5>
</div>

<div align="center">
  <a href="https://go.unkey.com">unkey.com</a>
</div>
<br/>

# 代码阅读推荐顺序

## 1. 核心认证与授权

- [/apps/api/src/pkg/auth/root_key.ts](apps/api/src/pkg/auth/root_key.ts) - 根密钥认证实现
- [/apps/api/src/routes/v1_keys_verifyKey.ts](apps/api/src/routes/v1_keys_verifyKey.ts) - 密钥验证API实现
- [/apps/docs/api-reference/authentication.mdx](apps/docs/api-reference/authentication.mdx) - API认证文档
- [/apps/docs/security/overview.mdx](apps/docs/security/overview.mdx) - 安全性设计说明

## 2. API密钥管理

- [/apps/api/src/routes/v1_keys_createKey.ts](apps/api/src/routes/v1_keys_createKey.ts) - 创建密钥API
- [/apps/api/src/routes/v1_keys_getKey.ts](apps/api/src/routes/v1_keys_getKey.ts) - 获取密钥详情API
- [/apps/api/src/routes/v1_keys_whoami.ts](apps/api/src/routes/v1_keys_whoami.ts) - 获取当前密钥信息API
- [/internal/db/src/schema/keyAuth.ts](internal/db/src/schema/keyAuth.ts) - 密钥认证数据模型

## 3. 权限与角色控制

- [/apps/docs/apis/features/authorization/introduction.mdx](apps/docs/apis/features/authorization/introduction.mdx) - RBAC介绍
- [/apps/docs/apis/features/authorization/example.mdx](apps/docs/apis/features/authorization/example.mdx) - RBAC使用示例
- [/apps/engineering/content/rfcs/0001-rbac.mdx](apps/engineering/content/rfcs/0001-rbac.mdx) - RBAC设计RFC

## 4. 速率限制实现

- [/apps/engineering/content/architecture/services/api/ratelimiting.mdx](apps/engineering/content/architecture/services/api/ratelimiting.mdx) - 速率限制架构设计
- [/apps/docs/apis/features/ratelimiting/modes.mdx](apps/docs/apis/features/ratelimiting/modes.mdx) - 速率限制模式说明
- [/apps/docs/ratelimiting/introduction.mdx](apps/docs/ratelimiting/introduction.mdx) - 速率限制功能概述
- [/apps/api/src/routes/v1_ratelimits_limit.ts](apps/api/src/routes/v1_ratelimits_limit.ts) - 速率限制API实现

## 5. 高级功能

- [/apps/docs/apis/features/remaining.mdx](apps/docs/apis/features/remaining.mdx) - 使用次数限制说明 *
- [/apps/docs/apis/features/revocation.mdx](apps/docs/apis/features/revocation.mdx) - 密钥吊销机制 *
- [/apps/docs/ratelimiting/automated-overrides.mdx](apps/docs/ratelimiting/automated-overrides.mdx) - 自动化覆盖规则 *

## 6. 集成示例

- [/apps/www/content/blog/using-unkey-with-auth.mdx](apps/www/content/blog/using-unkey-with-auth.mdx) - 认证服务集成指南
- [/apps/www/content/blog/secure-supabase-functions-using-unkey.mdx](apps/www/content/blog/secure-supabase-functions-using-unkey.mdx) - Supabase函数集成
- [/apps/www/content/blog/cli-auth.mdx](apps/www/content/blog/cli-auth.mdx) * - CLI认证集成指南
- [/apps/www/content/blog/ratelimiting-otp.mdx](apps/www/content/blog/ratelimiting-otp.mdx) * - OTP速率限制实践指南

## 7. 项目愿景与架构 *

- [/apps/www/content/blog/why-we-built-unkey.mdx](apps/www/content/blog/why-we-built-unkey.mdx) * - 项目愿景与功能概览
- [/apps/www/content/blog/vault.mdx](apps/www/content/blog/vault.mdx) * - 密钥恢复功能说明
- [/apps/www/content/blog/improve-auth-experience.mdx](apps/www/content/blog/improve-auth-experience.mdx) * - 认证体验优化指南

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
