package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/unkeyed/unkey/apps/agent/pkg/api/validation"
	"github.com/unkeyed/unkey/apps/agent/pkg/logging"
	"github.com/unkeyed/unkey/apps/agent/pkg/metrics"
	"github.com/unkeyed/unkey/apps/agent/services/ratelimit"
	"github.com/unkeyed/unkey/apps/agent/services/vault"
)

// Server 定义了 Agent API 服务器
type Server struct {
	sync.Mutex
	logger      logging.Logger      // 日志记录器
	metrics     metrics.Metrics     // 指标收集器
	isListening bool               // 服务器是否正在监听
	mux         *http.ServeMux     // HTTP 路由复用器
	srv         *http.Server       // HTTP 服务器

	authToken  string              // 用于服务间通信的认证令牌
	vault      *vault.Service      // 密钥管理服务
	ratelimit  ratelimit.Service   // 速率限制服务
	
	clickhouse EventBuffer         // ClickHouse 事件缓冲区
	validator  validation.OpenAPIValidator // OpenAPI 验证器
}

// Config 定义了服务器的配置选项
type Config struct {
	NodeId     string             // 节点标识符
	Logger     logging.Logger     // 日志记录器
	Metrics    metrics.Metrics    // 指标收集器
	Ratelimit  ratelimit.Service  // 速率限制服务
	Clickhouse EventBuffer        // ClickHouse 事件缓冲区
	Vault      *vault.Service     // 密钥管理服务
	AuthToken  string            // 服务间认证令牌
}

func New(config Config) (*Server, error) {

	mux := http.NewServeMux()
	srv := &http.Server{
		Handler: mux,
		// See https://blog.cloudflare.com/the-complete-guide-to-golang-net-http-timeouts/
		//
		// > # http.ListenAndServe is doing it wrong
		// > Incidentally, this means that the package-level convenience functions that bypass http.Server
		// > like http.ListenAndServe, http.ListenAndServeTLS and http.Serve are unfit for public Internet
		// > Servers.
		// >
		// > Those functions leave the Timeouts to their default off value, with no way of enabling them,
		// > so if you use them you'll soon be leaking connections and run out of file descriptors. I've
		// > made this mistake at least half a dozen times.
		// >
		// > Instead, create a http.Server instance with ReadTimeout and WriteTimeout and use its
		// > corresponding methods, like in the example a few paragraphs above.
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 20 * time.Second,
	}

	s := &Server{
		logger:      config.Logger,
		metrics:     config.Metrics,
		ratelimit:   config.Ratelimit,
		vault:       config.Vault,
		isListening: false,
		mux:         mux,
		srv:         srv,
		clickhouse:  config.Clickhouse,
		authToken:   config.AuthToken,
	}
	// validationMiddleware, err := s.createOpenApiValidationMiddleware("./pkg/openapi/openapi.json")
	// if err != nil {
	// 	return nil, fault.Wrap(err, fmsg.With("openapi spec encountered an error"))
	// }
	// s.app.Use(
	// 	createLoggerMiddleware(s.logger),
	// 	createMetricsMiddleware(),
	// 	// validationMiddleware,
	// )
	// s.app.Use(tracingMiddleware)
	v, err := validation.New()
	if err != nil {
		return nil, err
	}
	s.validator = v

	s.srv.Handler = withMetrics(withTracing(withRequestId(s.mux)))

	return s, nil
}

// Calling this function multiple times will have no effect.
func (s *Server) Listen(addr string) error {
	s.Lock()
	if s.isListening {
		s.logger.Warn().Msg("already listening")
		s.Unlock()
		return nil
	}
	s.isListening = true
	s.Unlock()
	s.RegisterRoutes()

	s.srv.Addr = addr

	s.logger.Info().Str("addr", addr).Msg("listening")
	return s.srv.ListenAndServe()
}

func (s *Server) Shutdown() error {
	s.Lock()
	defer s.Unlock()
	return s.srv.Close()

}
