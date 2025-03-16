/**
 * Unkey API 客户端的核心实现
 * 该文件实现了与 Unkey API 服务交互的所有主要功能，包括：
 * - API密钥管理（创建、更新、验证、删除等）
 * - API资源管理
 * - 速率限制管理
 * - 身份管理
 * - 数据分析查询
 * - 迁移工具
 */
import type { PermissionQuery } from "@unkey/rbac";
import type { ErrorResponse } from "./errors";
import type { paths } from "./openapi";
import { type Telemetry, getTelemetry } from "./telemetry";

/**
 * Unkey 客户端的配置选项
 * 提供两种认证方式：rootKey(推荐)或废弃的token方式
 */
export type UnkeyOptions = (
  | {
      token?: never;
      /**
       * 从 unkey.dev 获取的根密钥。
       * 
       * 你可以在这里创建/管理你的根密钥:
       * https://unkey.dev/app/settings/root-keys
       */
      rootKey: string;
    }
  | {
      /**
       * 从 unkey.dev 获取的工作区密钥
       * 
       * @deprecated 推荐使用 `rootKey`
       */
      token: string;
      rootKey?: never;
    }
) & {
  /**
   * API 服务的基础 URL
   * @default https://api.unkey.dev
   */
  baseUrl?: string;
  /**
   * 遥测数据配置
   * 默认情况下遥测数据是启用的，会发送以下数据：
   * - 运行时环境 (Node.js / Edge)
   * - 平台 (Node.js / Vercel / AWS)
   * - SDK 版本
   */
  disableTelemetry?: boolean;
  /**
   * 网络错误重试配置
   */
  retry?: {
    /**
     * 重试次数设置
     * 最大请求数将是 `attempts + 1`
     * `0` 表示不重试
     *
     * @default 5
     */
    attempts?: number;
    /**
     * 返回下一次尝试前等待的毫秒数
     *
     * @default `(retryCount) => Math.round(Math.exp(retryCount) * 10)),`
     */
    backoff?: (retryCount: number) => number;
  };
  /**
   * 自定义 `fetch` 缓存行为
   */
  cache?: RequestCache;
  /**
   * 实例化此客户端的 SDK 版本。
   *
   * 用于内部指标，不受语义版本控制，可能随时更改。
   *
   * 除非你正在构建此 SDK 的包装器，否则可以将其留空。
   */
  wrapperSdkVersion?: string;
};

/**
 * API请求的内部类型定义
 * 支持GET和POST两种请求方法，并相应地配置查询参数或请求体
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
 * API响应结果的类型定义
 * 结果要么包含成功的结果数据，要么包含错误信息，但不会同时存在
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
   * 包括创建、更新、验证、删除等操作
   */
  public get keys() {
    return {
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
   */
  public get apis() {
    return {
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
   */
  public get ratelimits() {
    return {
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
   */
  public get identities() {
    return {
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
   */
  public get analytics() {
    return {
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
   */
  public get migrations() {
    return {
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
