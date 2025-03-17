/**
 * Unkey API 客户端测试文件
 * 
 * 这个文件包含了对 Unkey API 客户端的基本测试用例。测试使用 vitest 测试框架进行。
 * vitest 是一个现代化的 JavaScript 测试框架，专门为 Vite 项目设计。
 */

import { describe, expect, test } from "vitest";
import { Unkey } from "./client";

/**
 * 客户端测试集
 * 包含了对 Unkey 客户端基本功能的验证测试
 */
describe("client", () => {
  /**
   * 测试参数编码的正确性
   * 
   * 这个测试确保客户端在处理 undefined 参数时不会抛出错误。
   * 在实际应用中，API 调用可能会包含未定义的参数值，客户端应该能够正确处理这种情况。
   * 
   * 例如：当用户不提供分页的 cursor 参数时，客户端应该正常工作而不是崩溃
   */
  test("fetch can encode the params without throwing", async () => {
    // 创建一个测试用的 Unkey 客户端实例
    const unkey = new Unkey({ token: "rawr" });
    
    // 验证使用 undefined 参数调用 API 不会抛出错误
    expect(() => {
      unkey.apis.listKeys({
        apiId: "meow",    // 提供一个测试用的 API ID
        cursor: undefined, // 故意使用 undefined 测试参数处理
      });
    }).not.toThrow();
  });

  /**
   * 测试错误处理机制
   * 
   * 这个测试验证当使用错误的认证密钥时，客户端能否正确处理和返回错误信息。
   * 在实际应用中，有效的错误处理对于调试和用户体验非常重要。
   * 
   * 测试检查以下几点：
   * 1. 确保错误对象包含所有必要的字段
   * 2. 验证错误码和消息的准确性
   * 3. 确保错误包含可追踪的请求 ID
   */
  test("errors are correctly passed through to the caller", async () => {
    // 使用错误的密钥创建客户端实例
    const unkey = new Unkey({ rootKey: "wrong key" });
    
    // 尝试创建一个新的 API 密钥（预期会失败）
    const res = await unkey.keys.create({
      apiId: "", // 使用空字符串作为 API ID，这是无效的
    });

    // 验证错误信息的完整性和准确性
    expect(res.error).toBeDefined();           // 确保返回了错误对象
    expect(res.error!.code).toEqual("UNAUTHORIZED"); // 验证错误代码
    expect(res.error!.docs).toEqual(           // 验证文档链接
      "https://unkey.dev/docs/api-reference/errors/code/UNAUTHORIZED",
    );
    expect(res.error!.message).toEqual("key not found"); // 验证错误消息
    expect(res.error!.requestId).toBeDefined(); // 确保包含请求 ID
  });
});
