/**
 * Unkey API 客户端的核心实现
 * 
 * 这个文件实现了与 Unkey API 服务交互的所有主要功能。Unkey是一个API密钥管理平台，
 * 提供了完整的API密钥生命周期管理、访问控制和使用分析功能。
 * 
 * 主要功能包括：
 * 1. API密钥管理（创建、更新、验证、删除等）
 * 2. API资源管理（创建API、查询API信息等）
 * 3. 速率限制管理（设置和检查访问限制）
 * 4. 身份管理（用户身份和权限控制）
 * 5. 数据分析（使用统计和监控）
 * 6. 数据迁移工具（批量导入导出）
 * 
 * @example 基础使用示例
 * ```typescript
 * const unkey = new Unkey({ rootKey: "your_root_key" });
 * 
 * // 创建新的API
 * const api = await unkey.apis.create({ name: "我的API服务" });
 * 
 * // 为API创建密钥
 * const key = await unkey.keys.create({
 *   apiId: api.result.apiId,
 *   name: "测试密钥",
 *   expires: Date.now() + 24 * 60 * 60 * 1000 // 1天后过期
 * });
 * ```
 */

import type { PermissionQuery } from "@unkey/rbac";
import type { ErrorResponse } from "./errors";
import type { paths } from "./openapi";
import { type Telemetry, getTelemetry } from "./telemetry";

/**
 * Unkey 客户端的配置选项
 * 
 * 配置对象支持两种认证方式：
 * 1. rootKey（推荐）：使用 Unkey 根密钥进行认证
 * 2. token（已废弃）：使用旧版工作区令牌认证
 * 
 * 同时可以配置：
 * - 基础URL（用于自定义部署）
 * - 遥测数据收集
 * - 网络错误重试策略
 * - 请求缓存行为
 */
export type UnkeyOptions = (
  | {
      token?: never;
      /**
       * Unkey根密钥
       * 用于认证和授权所有API请求
       * 
       * 获取/管理根密钥：
       * https://unkey.dev/app/settings/root-keys
       * 
       * 安全提示：
       * - 请妥善保管根密钥
       * - 建议使用环境变量存储
       * - 定期轮换密钥
       */
      rootKey: string;
    }
  | {
      /**
       * 工作区令牌认证方式
       * @deprecated 推荐使用 rootKey 方式
       */
      token: string;
      rootKey?: never;
    }
) & {
  /**
   * API服务的基础URL
   * @default "https://api.unkey.dev"
   * 
   * 使用场景：
   * - 连接自托管的Unkey服务
   * - 测试环境配置
   * - 自定义域名支持
   */
  baseUrl?: string;

  /**
   * 遥测数据收集配置
   * 默认启用，收集以下匿名数据：
   * - 运行时环境（Node.js/Edge）
   * - 平台信息（Node.js/Vercel/AWS等）
   * - SDK版本号
   * 
   * 这些数据用于：
   * - 改进服务质量
   * - 优化性能
   * - 确定开发重点
   */
  disableTelemetry?: boolean;

  /**
   * 网络错误重试配置
   * 当请求失败时，会按照配置的策略进行重试
   */
  retry?: {
    /**
     * 重试次数
     * - 实际最大请求数 = attempts + 1
     * - 设为0表示不重试
     * @default 5
     */
    attempts?: number;

    /**
     * 重试间隔计算函数
     * 返回下次重试前需要等待的毫秒数
     * @default 使用指数退避算法：(retryCount) => Math.round(Math.exp(retryCount) * 10)
     */
    backoff?: (retryCount: number) => number;
  };

  /**
   * 请求缓存策略
   * 控制fetch请求的缓存行为
   */
  cache?: RequestCache;

  /**
   * SDK包装器版本号
   * 仅在开发SDK封装时使用
   */
  wrapperSdkVersion?: string;
};

/**
 * API请求的内部类型定义
 * 根据HTTP方法区分请求格式：
 * - GET请求：使用查询参数
 * - POST请求：使用请求体
 */
type ApiRequest = {
  path: string[];
} & (
  | {
      method: "GET";
      body?: never;
      query?: Record<string, string | number | boolean | null | string[]>;
    }
  | {
      method: "POST";
      body?: unknown;
      query?: never;
    }
);

/**
 * API响应结果类型
 * 采用互斥联合类型设计：
 * - 成功时包含result
 * - 失败时包含error
 * 
 * 这种设计确保了：
 * 1. 类型安全：结果和错误不会同时存在
 * 2. 使用方便：可以用类型推断判断结果
 * 3. 错误处理清晰：包含了完整的错误信息
 */
type Result<R> =
  | {
      result: R;
      error?: never;
    }
  | {
      result?: never;
      error: {
        code: ErrorResponse["error"]["code"];
        message: ErrorResponse["error"]["message"];
        docs: ErrorResponse["error"]["docs"];
        requestId: string;
      };
    };

/**
 * Unkey 客户端主类
 * 提供与 Unkey API 交互的所有方法
 */
export class Unkey {
  /** API 服务的基础 URL */
  public readonly baseUrl: string;
  /** 用于认证的根密钥 */
  private readonly rootKey: string;
  /** 可选的请求缓存配置 */
  private readonly cache?: RequestCache;
  /** 遥测数据配置 */
  private readonly telemetry?: Telemetry | null;
  /** 重试配置 */
  public readonly retry: {
    attempts: number;
    backoff: (retryCount: number) => number;
  };

  /**
   * 构造一个新的 Unkey 客户端实例
   * @param opts 客户端配置选项
   */
  constructor(opts: UnkeyOptions) {
    this.baseUrl = opts.baseUrl ?? "https://api.unkey.dev";
    this.rootKey = opts.rootKey ?? opts.token;
    if (!opts.disableTelemetry) {
      this.telemetry = getTelemetry(opts);
    }

    this.cache = opts.cache;
    /**
     * Even though typescript should prevent this, some people still pass undefined or empty strings
     */
    if (!this.rootKey) {
      throw new Error(
        "Unkey root key must be set, maybe you passed in `undefined` or an empty string?",
      );
    }

    this.retry = {
      attempts: opts.retry?.attempts ?? 5,
      backoff: opts.retry?.backoff ?? ((n) => Math.round(Math.exp(n) * 10)),
    };
  }

  /**
   * 获取请求头，包括认证信息和遥测数据
   * @returns 请求头对象
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.rootKey}`,
    };
    if (this.telemetry?.sdkVersions) {
      headers["Unkey-Telemetry-SDK"] = this.telemetry.sdkVersions.join(",");
    }
    if (this.telemetry?.platform) {
      headers["Unkey-Telemetry-Platform"] = this.telemetry.platform;
    }
    if (this.telemetry?.runtime) {
      headers["Unkey-Telemetry-Runtime"] = this.telemetry.runtime;
    }
    return headers;
  }

  /**
   * 执行API请求的内部方法，支持重试逻辑
   * @param req API请求配置
   * @returns 请求结果
   */
  private async fetch<TResult>(req: ApiRequest): Promise<Result<TResult>> {
    let res: Response | null = null;
    let err: Error | null = null;
    for (let i = 0; i <= this.retry.attempts; i++) {
      const url = new URL(`${this.baseUrl}/${req.path.join("/")}`);
      if (req.query) {
        for (const [k, v] of Object.entries(req.query)) {
          if (typeof v === "undefined" || v === null) {
            continue;
          }
          url.searchParams.set(k, v.toString());
        }
      }
      res = await fetch(url, {
        method: req.method,
        headers: this.getHeaders(),
        cache: this.cache,
        body: JSON.stringify(req.body),
      }).catch((e: Error) => {
        err = e;
        return null; // set `res` to `null`
      });
      // 200-299 -> success
      if (res && res.status >= 200 && res.status <= 299) {
        return { result: (await res.json()) as TResult };
      }
      // 400-499 -> client error, retries are futile
      if (res && res.status >= 400 && res.status <= 499) {
        return (await res.json()) as ErrorResponse;
      }
      const backoff = this.retry.backoff(i);
      console.debug(
        `attempt ${i + 1} of ${
          this.retry.attempts + 1
        } to reach ${url} failed, retrying in ${backoff} ms: status=${
          res?.status
        } | ${res?.headers.get("unkey-request-id")}`,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }

    if (res) {
      return (await res.json()) as ErrorResponse;
    }

    return {
      error: {
        // @ts-ignore
        code: "FETCH_ERROR",
        // @ts-ignore I don't understand why `err` is `never`
        message: err?.message ?? "No response",
        docs: "https://developer.mozilla.org/en-US/docs/Web/API/fetch",
        requestId: "N/A",
      },
    };
  }

  /**
   * API密钥管理相关方法
   * 提供了API密钥的完整生命周期管理功能
   */
  public get keys() {
    return {
      /**
       * 创建新的API密钥
       * @param req 密钥创建请求参数
       * @returns 返回新创建的密钥信息
       * 
       * 支持的配置选项：
       * - prefix: 密钥前缀，用于区分不同用途
       * - name: 密钥名称，便于管理
       * - expires: 过期时间戳
       * - meta: 自定义元数据
       * - ratelimit: 速率限制配置
       * - remaining: 剩余使用次数
       * - enabled: 是否启用
       * 
       * 使用示例：
       * ```typescript
       * const key = await unkey.keys.create({
       *   apiId: "api_xxx",
       *   name: "测试密钥",
       *   expires: Date.now() + 86400000, // 24小时后过期
       *   ratelimit: {
       *     limit: 1000,
       *     duration: 3600 // 每小时1000次
       *   }
       * });
       * ```
       */
      create: async (
        req: paths["/v1/keys.createKey"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/keys.createKey"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "keys.createKey"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 更新现有API密钥的配置
       * @param req 更新请求参数
       * @returns 更新成功时返回空对象
       * 
       * 可更新的内容：
       * 1. 基本信息
       *    - 名称
       *    - 所有者ID
       *    - 元数据
       * 2. 使用限制
       *    - 过期时间
       *    - 速率限制
       *    - 剩余次数
       * 3. 权限设置
       *    - 启用状态
       *    - 角色
       *    - 权限
       * 
       * 注意：某些字段设置为null表示删除该配置
       */
      update: async (
        req: paths["/v1/keys.updateKey"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/keys.updateKey"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "keys.updateKey"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 验证API密钥的有效性和权限
       * @param req 验证请求参数
       * @returns 返回验证结果，包含密钥状态和权限信息
       * 
       * 验证内容包括：
       * 1. 密钥有效性
       * 2. 过期状态
       * 3. 使用限制
       * 4. 速率限制
       * 5. 权限检查
       * 
       * 特色功能：
       * - 支持泛型定义权限类型
       * - 可以进行细粒度的权限验证
       * - 支持自定义资源标签
       * 
       * 示例：
       * ```typescript
       * const result = await unkey.keys.verify({
       *   key: "uk_xxx",
       *   authorization: {
       *     permissions: {
       *       and: ["read:files", "write:files"]
       *     }
       *   }
       * });
       * ```
       */
      verify: async <TPermission extends string = string>(
        req: Omit<
          paths["/v1/keys.verifyKey"]["post"]["requestBody"]["content"]["application/json"],
          "authorization"
        > & { authorization?: { permissions: PermissionQuery<TPermission> } },
      ): Promise<
        Result<
          paths["/v1/keys.verifyKey"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "keys.verifyKey"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 删除指定的API密钥
       * @param req 删除请求参数
       * @returns 删除成功时返回空对象
       * 
       * 支持的选项：
       * - permanent: 是否永久删除
       * 
       * 安全建议：
       * 1. 建议先禁用密钥，确认无影响后再删除
       * 2. 重要密钥建议保留删除记录
       * 3. 批量删除时需要特别谨慎
       */
      delete: async (
        req: paths["/v1/keys.deleteKey"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/keys.deleteKey"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "keys.deleteKey"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 更新密钥的剩余使用次数
       * @param req 更新请求参数
       * @returns 返回更新后的剩余次数
       * 
       * 支持的操作：
       * - increment: 增加次数
       * - decrement: 减少次数
       * - set: 设置为指定值
       * 
       * 使用场景：
       * - 手动调整配额
       * - 奖励额外使用次数
       * - 处理特殊情况
       * 
       * 示例：
       * ```typescript
       * // 增加100次使用限额
       * await unkey.keys.updateRemaining({
       *   keyId: "key_xxx",
       *   op: "increment",
       *   value: 100
       * });
       * ```
       */
      updateRemaining: async (
        req: paths["/v1/keys.updateRemaining"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/keys.updateRemaining"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "keys.updateRemaining"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 获取指定API密钥的详细信息
       * @param req 查询参数
       * @returns 返回密钥的完整信息
       * 
       * 可查询的信息：
       * - 基本配置
       * - 使用限制
       * - 验证历史
       * - 关联的身份
       * 
       * 支持的选项：
       * - decrypt: 是否返回完整的密钥内容
       * 
       * 使用提示：
       * - 建议只在必要时请求完整密钥
       * - 可以用于验证密钥配置
       * - 适合调试和审计使用
       */
      get: async (
        req: paths["/v1/keys.getKey"]["get"]["parameters"]["query"],
      ): Promise<
        Result<paths["/v1/keys.getKey"]["get"]["responses"]["200"]["content"]["application/json"]>
      > => {
        return await this.fetch({
          path: ["v1", "keys.getKey"],
          method: "GET",
          query: req,
        });
      },

      /**
       * 获取密钥的验证历史记录
       * @param req 查询参数
       * @returns 返回验证历史数据
       * 
       * 统计信息包括：
       * - 验证次数
       * - 成功/失败比例
       * - 限制触发情况
       * 
       * 应用场景：
       * 1. 监控密钥使用情况
       * 2. 分析使用模式
       * 3. 排查问题
       * 4. 生成使用报告
       * 
       * 最佳实践：
       * - 定期检查异常模式
       * - 结合日志进行分析
       * - 设置适当的时间范围
       */
      getVerifications: async (
        req: paths["/v1/keys.getVerifications"]["get"]["parameters"]["query"],
      ): Promise<
        Result<
          paths["/v1/keys.getVerifications"]["get"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "keys.getVerifications"],
          method: "GET",
          query: req,
        });
      },
    };
  }

  /**
   * API资源管理相关方法
   * 提供了对 API 资源的完整生命周期管理，包括：
   * - 创建新的 API
   * - 删除现有 API
   * - 获取 API 详情
   * - 列出 API 下的所有密钥
   */
  public get apis() {
    return {
      /**
       * 创建新的 API
       * @param req 创建API的请求参数，包含API名称等基本信息
       * @returns 返回包含新创建的API ID的结果对象
       * 
       * 示例：
       * ```typescript
       * const result = await unkey.apis.create({
       *   name: "我的新API"
       * });
       * // result.result.apiId 将包含新创建的API的ID
       * ```
       */
      create: async (
        req: paths["/v1/apis.createApi"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/apis.createApi"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "apis.createApi"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 删除指定的 API
       * @param req 包含要删除的API ID的请求对象
       * @returns 成功时返回空对象
       * 
       * 注意：删除API会同时删除该API下的所有密钥，请谨慎操作
       */
      delete: async (
        req: paths["/v1/apis.deleteApi"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/apis.deleteApi"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "apis.deleteApi"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 获取API详细信息
       * @param req 包含目标API ID的查询参数
       * @returns 返回API的详细信息，包括名称和所属工作区等
       * 
       * 示例：
       * ```typescript
       * const result = await unkey.apis.get({
       *   apiId: "api_123"
       * });
       * // result.result 将包含API的详细信息
       * ```
       */
      get: async (
        req: paths["/v1/apis.getApi"]["get"]["parameters"]["query"],
      ): Promise<
        Result<paths["/v1/apis.getApi"]["get"]["responses"]["200"]["content"]["application/json"]>
      > => {
        return await this.fetch({
          path: ["v1", "apis.getApi"],
          method: "GET",
          query: req,
        });
      },

      /**
       * 列出指定API下的所有密钥
       * @param req 查询参数，包括API ID、分页参数等
       * @returns 返回密钥列表和分页信息
       * 
       * 支持的查询参数：
       * - limit: 每页返回的密钥数量
       * - cursor: 用于分页的游标
       * - ownerId: 按密钥所有者ID筛选
       * - decrypt: 是否返回完整的密钥内容
       */
      listKeys: async (
        req: paths["/v1/apis.listKeys"]["get"]["parameters"]["query"],
      ): Promise<
        Result<paths["/v1/apis.listKeys"]["get"]["responses"]["200"]["content"]["application/json"]>
      > => {
        return await this.fetch({
          path: ["v1", "apis.listKeys"],
          method: "GET",
          query: req,
        });
      },
    };
  }

  /**
   * 速率限制管理相关方法
   * 提供了对速率限制的精确控制，包括：
   * - 检查和应用速率限制
   * - 管理速率限制覆盖规则
   * - 查询速率限制状态
   */
  public get ratelimits() {
    return {
      /**
       * 检查并应用速率限制
       * @param req 速率限制请求参数
       * @returns 返回限制检查结果，包括是否允许请求、剩余配额等
       * 
       * 可以用于：
       * 1. API调用次数限制
       * 2. 并发请求控制
       * 3. 自定义资源使用限制
       * 
       * 示例：
       * ```typescript
       * const result = await unkey.ratelimits.limit({
       *   identifier: "user_123",
       *   limit: 100,
       *   duration: 3600, // 1小时
       * });
       * ```
       */
      limit: async (
        req: paths["/v1/ratelimits.limit"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/ratelimits.limit"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "ratelimits.limit"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 获取特定标识符的速率限制覆盖规则
       * @param req 查询参数，包括命名空间和标识符
       * @returns 返回覆盖规则的详细信息
       * 
       * 使用场景：
       * - 检查特定用户/IP的自定义限制规则
       * - 验证限制规则是否正确应用
       */
      getOverride: async (
        req: paths["/v1/ratelimits.getOverride"]["get"]["parameters"]["query"],
      ): Promise<
        Result<
          paths["/v1/ratelimits.getOverride"]["get"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "ratelimits.getOverride"],
          method: "GET",
          query: req,
        });
      },

      /**
       * 列出所有速率限制覆盖规则
       * @param req 查询参数，支持分页
       * @returns 返回覆盖规则列表和分页信息
       * 
       * 适用于：
       * - 审计当前活动的所有覆盖规则
       * - 批量管理限制规则
       */
      listOverrides: async (
        req: paths["/v1/ratelimits.listOverrides"]["get"]["parameters"]["query"],
      ): Promise<
        Result<
          paths["/v1/ratelimits.listOverrides"]["get"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "ratelimits.listOverrides"],
          method: "GET",
          query: req,
        });
      },

      /**
       * 设置新的速率限制覆盖规则
       * @param req 覆盖规则配置
       * @returns 返回新创建的覆盖规则ID
       * 
       * 常见用途：
       * - 为特定客户设置更高的限制
       * - 临时调整某个IP的访问限制
       * - 实现高级用户特权
       */
      setOverride: async (
        req: paths["/v1/ratelimits.setOverride"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/ratelimits.setOverride"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "ratelimits.setOverride"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 删除速率限制覆盖规则
       * @param req 要删除的覆盖规则标识信息
       * @returns 成功时返回空对象
       * 
       * 注意：
       * - 删除后将立即恢复到默认的限制规则
       * - 此操作不可撤销
       */
      deleteOverride: async (
        req: paths["/v1/ratelimits.deleteOverride"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/ratelimits.deleteOverride"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "ratelimits.deleteOverride"],
          method: "POST",
          body: req,
        });
      },
    };
  }

  /**
   * 身份管理相关方法
   * 提供了用户身份的完整生命周期管理，包括：
   * - 创建和更新身份信息
   * - 查询身份详情
   * - 管理身份关联的限制规则
   */
  public get identities() {
    return {
      /**
       * 创建新的身份
       * @param req 身份创建请求，包含外部ID和元数据
       * @returns 返回新创建的身份ID
       * 
       * 使用场景：
       * - 用户首次注册时创建对应的身份
       * - 导入外部系统用户时建立映射
       * 
       * 示例：
       * ```typescript
       * const result = await unkey.identities.create({
       *   externalId: "user_12345",
       *   meta: {
       *     name: "张三",
       *     plan: "premium"
       *   }
       * });
       * ```
       */
      create: async (
        req: paths["/v1/identities.createIdentity"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/identities.createIdentity"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "identities.createIdentity"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 获取身份详情
       * @param req 查询参数，可以使用身份ID或外部ID
       * @returns 返回身份的完整信息
       * 
       * 查询示例：
       * ```typescript
       * // 使用身份ID查询
       * const result1 = await unkey.identities.get({
       *   identityId: "idt_123"
       * });
       * 
       * // 使用外部ID查询
       * const result2 = await unkey.identities.get({
       *   externalId: "user_12345"
       * });
       * ```
       */
      get: async (
        req: paths["/v1/identities.getIdentity"]["get"]["parameters"]["query"],
      ): Promise<
        Result<
          paths["/v1/identities.getIdentity"]["get"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "identities.getIdentity"],
          method: "GET",
          query: req,
        });
      },

      /**
       * 列出所有身份
       * @param req 查询参数，支持分页
       * @returns 返回身份列表
       * 
       * 适用场景：
       * - 管理界面展示用户列表
       * - 批量处理身份数据
       * - 系统审计和统计
       */
      list: async (
        req: paths["/v1/identities.listIdentities"]["get"]["parameters"]["query"],
      ): Promise<
        Result<
          paths["/v1/identities.listIdentities"]["get"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "identities.listIdentities"],
          method: "GET",
          query: req,
        });
      },

      /**
       * 删除指定身份
       * @param req 要删除的身份ID
       * @returns 操作成功时返回空对象
       * 
       * 注意事项：
       * - 删除身份会同时清除相关的限制规则
       * - 此操作不可逆，请谨慎操作
       * - 建议先备份相关数据
       */
      delete: async (
        req: paths["/v1/identities.deleteIdentity"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/identities.deleteIdentity"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "identities.deleteIdentity"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 更新身份信息
       * @param req 更新请求，包含身份ID和要更新的字段
       * @returns 更新成功时返回空对象
       * 
       * 可更新内容：
       * - 元数据信息
       * - 速率限制规则
       * - 关联的外部ID
       * 
       * 示例：
       * ```typescript
       * await unkey.identities.update({
       *   identityId: "idt_123",
       *   meta: {
       *     plan: "enterprise",
       *     lastLogin: new Date().toISOString()
       *   }
       * });
       * ```
       */
      update: async (
        req: paths["/v1/identities.updateIdentity"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/identities.updateIdentity"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "identities.updateIdentity"],
          method: "POST",
          body: req,
        });
      },
    };
  }

  /**
   * 数据分析查询相关方法
   * 提供各种统计和分析功能，帮助了解API使用情况
   */
  public get analytics() {
    return {
      /**
       * 获取密钥验证统计数据
       * @param req 查询参数，支持时间范围和粒度设置
       * @returns 返回验证统计数据
       * 
       * 统计指标包括：
       * - 成功验证次数
       * - 速率限制触发次数
       * - 使用量超限次数
       * 
       * 应用场景：
       * 1. 监控API使用趋势
       * 2. 识别异常使用模式
       * 3. 生成使用报告
       * 
       * 示例：
       * ```typescript
       * const stats = await unkey.analytics.getVerifications({
       *   keyId: "key_123",
       *   start: Date.now() - 7 * 24 * 60 * 60 * 1000, // 七天前
       *   end: Date.now(),
       *   granularity: "day"
       * });
       * ```
       */
      getVerifications: async (
        req: paths["/v1/analytics.getVerifications"]["get"]["parameters"]["query"],
      ): Promise<
        Result<
          paths["/v1/analytics.getVerifications"]["get"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "analytics.getVerifications"],
          method: "GET",
          query: req,
        });
      },
    };
  }

  /**
   * 迁移工具相关方法
   * 提供数据迁移和批量操作的工具
   */
  public get migrations() {
    return {
      /**
       * 批量创建API密钥
       * @param req 创建请求，包含多个密钥的配置
       * @returns 返回创建的密钥ID列表
       * 
       * 使用场景：
       * - 从其他系统迁移API密钥
       * - 批量为用户创建密钥
       * - 系统初始化时批量设置
       * 
       * 注意事项：
       * - 建议分批进行，避免单次请求过大
       * - 确保每个密钥配置的正确性
       * - 可以指定明文密钥或使用自动生成
       */
      createKeys: async (
        req: paths["/v1/migrations.createKeys"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/migrations.createKeys"]["post"]["responses"]["200"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "migrations.createKeys"],
          method: "POST",
          body: req,
        });
      },

      /**
       * 将密钥创建任务加入队列
       * @param req 包含迁移ID和要创建的密钥列表
       * @returns 返回202状态表示任务已接受
       * 
       * 适用于：
       * - 大规模密钥迁移
       * - 需要异步处理的批量创建
       * - 长时间运行的迁移任务
       * 
       * 最佳实践：
       * 1. 先创建迁移计划
       * 2. 将密钥分批提交
       * 3. 监控迁移进度
       * 4. 验证迁移结果
       */
      enqueueKeys: async (
        req: paths["/v1/migrations.enqueueKeys"]["post"]["requestBody"]["content"]["application/json"],
      ): Promise<
        Result<
          paths["/v1/migrations.enqueueKeys"]["post"]["responses"]["202"]["content"]["application/json"]
        >
      > => {
        return await this.fetch({
          path: ["v1", "migrations.enqueueKeys"],
          method: "POST",
          body: req,
        });
      },
    };
  }
}
