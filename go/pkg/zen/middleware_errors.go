package zen

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/unkeyed/unkey/go/api"
	"github.com/unkeyed/unkey/go/pkg/fault"
	"github.com/unkeyed/unkey/go/pkg/otel/logging"
)

// HTTP错误处理中间件
// 
// 将各种错误转换为标准的HTTP响应格式。
// 想象这是一个翻译官：
// - 把程序内部的错误语言
// - 转换成客户端能看懂的HTTP响应
//
// 示例:
//
//	server.RegisterRoute(
//	    []zen.Middleware{zen.WithErrorHandling()},
//	    route,
//	)
func WithErrorHandling(logger logging.Logger) Middleware {
	return func(next HandleFunc) HandleFunc {
		return func(ctx context.Context, s *Session) error {
			err := next(ctx, s)

			if err == nil {
				return nil
				}

			 // 记录错误步骤
			errorSteps := fault.Flatten(err)
			if len(errorSteps) > 0 {
				var b strings.Builder
				b.WriteString("错误追踪:\n")

				for i, step := range errorSteps {
					// 跳过空消息
					if step.Message == "" {
						continue
					}

					b.WriteString(fmt.Sprintf("  步骤 %d:\n", i+1))

					if step.Location != "" {
						b.WriteString(fmt.Sprintf("    位置: %s\n", step.Location))
					} else {
						b.WriteString("    位置: 未知\n")
					}

					b.WriteString(fmt.Sprintf("    消息: %s\n", step.Message))

					// 在步骤之间添加分隔符
					if i < len(errorSteps)-1 {
						b.WriteString("\n")
					}
				}

				logger.Error("API遇到错误", "trace", b.String())
			}

			// 根据错误标签返回适当的HTTP响应
			switch fault.GetTag(err) {
			case fault.NOT_FOUND:
				return s.JSON(http.StatusNotFound, api.NotFoundError{
					Title:     "未找到资源",
					Type:      "https://unkey.com/docs/errors/not_found",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusNotFound,
					Instance:  nil,
				})

			case fault.BAD_REQUEST:
				return s.JSON(http.StatusBadRequest, api.BadRequestError{
					Title:     "请求无效",
					Type:      "https://unkey.com/docs/errors/bad_request",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusBadRequest,
					Instance:  nil,
					Errors:    []api.ValidationError{},
				})

			case fault.UNAUTHORIZED:
				return s.JSON(http.StatusUnauthorized, api.UnauthorizedError{
					Title:     "未授权",
					Type:      "https://unkey.com/docs/errors/unauthorized",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusUnauthorized,
					Instance:  nil,
				})

			case fault.FORBIDDEN:
				return s.JSON(http.StatusForbidden, api.ForbiddenError{
					Title:     "禁止访问",
					Type:      "https://unkey.com/docs/errors/forbidden",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusForbidden,
					Instance:  nil,
				})
			case fault.INSUFFICIENT_PERMISSIONS:
				return s.JSON(http.StatusForbidden, api.ForbiddenError{
					Title:     "Insufficient Permissions",
					Type:      "https://unkey.com/docs/errors/insufficient_permissions",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusForbidden,
					Instance:  nil,
				})
			case fault.PROTECTED_RESOURCE:
				return s.JSON(http.StatusPreconditionFailed, api.PreconditionFailedError{
					Title:     "Resource is protected",
					Type:      "https://unkey.com/docs/errors/deletion_prevented",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusPreconditionFailed,
					Instance:  nil,
				})

			case fault.DATABASE_ERROR:
				break // 返回默认500错误

			case fault.UNTAGGED:
				break // 返回默认500错误

			case fault.ASSERTION_FAILED:
				break // 返回默认500错误
			case fault.INTERNAL_SERVER_ERROR:
				break
			}

			// 处理所有未分类的错误
			return s.JSON(http.StatusInternalServerError, api.InternalServerError{
				Title:     "服务器内部错误",
				Type:      "https://unkey.com/docs/errors/internal_server_error",
				Detail:    fault.UserFacingMessage(err),
				RequestId: s.requestID,
				Status:    http.StatusInternalServerError,
				Instance:  nil,
			})
		}
	}
}
