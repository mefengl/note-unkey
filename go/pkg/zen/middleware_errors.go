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

// WithErrorHandling 返回一个错误处理中间件
// 根据错误标签将错误转换为适当的HTTP响应:
//
//   - NOT_FOUND: 404 资源未找到
//   - BAD_REQUEST: 400 请求格式错误
//   - UNAUTHORIZED: 401 未经身份验证
//   - FORBIDDEN: 403 权限不足
//   - PROTECTED_RESOURCE: 412 前置条件不满足
//   - 其他错误: 500 服务器内部错误
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
					Title:     "Not Found",
					Type:      "https://unkey.com/docs/errors/not_found",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusNotFound,
					Instance:  nil,
				})

			case fault.BAD_REQUEST:
				return s.JSON(http.StatusBadRequest, api.BadRequestError{
					Title:     "Bad Request",
					Type:      "https://unkey.com/docs/errors/bad_request",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusBadRequest,
					Instance:  nil,
					Errors:    []api.ValidationError{},
				})

			case fault.UNAUTHORIZED:
				return s.JSON(http.StatusUnauthorized, api.UnauthorizedError{
					Title:     "Unauthorized",
					Type:      "https://unkey.com/docs/errors/unauthorized",
					Detail:    fault.UserFacingMessage(err),
					RequestId: s.requestID,
					Status:    http.StatusUnauthorized,
					Instance:  nil,
				})

			case fault.FORBIDDEN:
				return s.JSON(http.StatusForbidden, api.ForbiddenError{
					Title:     "Forbidden",
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
				Title:     "Internal Server Error",
				Type:      "https://unkey.com/docs/errors/internal_server_error",
				Detail:    fault.UserFacingMessage(err),
				RequestId: s.requestID,
				Status:    http.StatusInternalServerError,
				Instance:  nil,
			})
		}
	}
}
