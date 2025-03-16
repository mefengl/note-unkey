package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

const (
	maxBufferSize int = 50000 // 缓冲区最大容量
	maxBatchSize  int = 10000 // 批处理最大大小
)

var (
	telemetry  *TelemetryConfig  // 遥测配置
	inFlight   sync.WaitGroup    // 追踪进行中的请求
	httpClient *http.Client      // 共享的 HTTP 客户端
)

// main 函数实现了 ClickHouse 的代理服务
// 它接收 HTTP 请求并将数据批量写入 ClickHouse
func main() {
	// 加载配置
	config, err := LoadConfig()
	if err != nil {
		log.Fatalf("failed to load configuration: %v", err)
	}

	// 初始化 HTTP 客户端
	httpClient = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        25,
			MaxIdleConnsPerHost: 25,
			IdleConnTimeout:     60 * time.Second,
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 设置遥测系统
	var cleanup func(context.Context) error
	telemetry, cleanup, err = setupTelemetry(ctx, config)
	if err != nil {
		log.Fatalf("failed to setup telemetry: %v", err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := cleanup(cleanupCtx); err != nil {
			log.Printf("failed to cleanup telemetry: %v", err)
		}
	}()

	if telemetry != nil && telemetry.LogHandler != nil {
		config.Logger = slog.New(telemetry.LogHandler)
		slog.SetDefault(config.Logger)
	}

	config.Logger.Info(fmt.Sprintf("%s starting", config.ServiceName),
		"flush_interval", config.FlushInterval.String())

	// 设置基本认证
	requiredAuthorization := "Basic " + base64.StdEncoding.EncodeToString([]byte(config.BasicAuth))

	// 创建请求缓冲通道
	buffer := make(chan *Batch, maxBufferSize)

	// 启动缓冲处理器
	done := startBufferProcessor(ctx, buffer, config, telemetry)

	// 健康检查路由
	http.HandleFunc("/v1/liveness", func(w http.ResponseWriter, r *http.Request) {
		_, span := telemetry.Tracer.Start(r.Context(), "liveness_check")
		defer span.End()

		span.SetAttributes(
			attribute.String("method", r.Method),
			attribute.String("path", r.URL.Path),
		)

		w.Write([]byte("ok"))
		span.SetStatus(codes.Ok, "")
	})

	// 主要的处理路由
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		inFlight.Add(1)
		defer inFlight.Done()

		ctx, span := telemetry.Tracer.Start(r.Context(), "handle_request")
		defer span.End()

		telemetry.Metrics.RequestCounter.Add(ctx, 1)

		// 验证认证信息
		if r.Header.Get("Authorization") != requiredAuthorization {
			telemetry.Metrics.ErrorCounter.Add(ctx, 1)
			config.Logger.Error("invalid authorization header",
				"remote_addr", r.RemoteAddr,
				"user_agent", r.UserAgent())

			span.RecordError(err)
			span.SetStatus(codes.Error, "unauthorized")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		span.SetAttributes(
			attribute.String("method", r.Method),
			attribute.String("path", r.URL.Path),
			attribute.String("remote_addr", r.RemoteAddr),
		)

		// 处理查询
		query := r.URL.Query().Get("query")
		span.SetAttributes(attribute.String("query", query))

		if query == "" || !strings.HasPrefix(strings.ToLower(query), "insert into") {
			telemetry.Metrics.ErrorCounter.Add(ctx, 1)
			config.Logger.Warn("invalid query",
				"query", query,
				"remote_addr", r.RemoteAddr)
			
			span.SetStatus(codes.Error, "wrong query")
			http.Error(w, "wrong query", http.StatusBadRequest)
			return
		}

		// 读取请求体
		body, err := io.ReadAll(r.Body)
		if err != nil {
			telemetry.Metrics.ErrorCounter.Add(ctx, 1)
			config.Logger.Error("failed to read request body",
				"error", err.Error(),
				"remote_addr", r.RemoteAddr)

			span.RecordError(err)
			span.SetStatus(codes.Error, "cannot read body")
			http.Error(w, "cannot read body", http.StatusInternalServerError)
			return
		}
		
		rows := strings.Split(string(body), "\n")
		config.Logger.Debug("received insert request",
			"row_count", len(rows),
			"table", strings.Split(query, " ")[2])

		// 将数据发送到缓冲区
		buffer <- &Batch{
			Params: params,
			Rows:   rows,
			Table:  strings.Split(query, " ")[2],
		}

		w.Write([]byte("ok"))
		span.SetStatus(codes.Ok, "")
		span.SetAttributes(
			attribute.Int("row_count", len(rows)),
			attribute.String("table", strings.Split(query, " ")[2]),
		)
	})

	// 信号处理
	signalCtx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// 启动 HTTP 服务器
	server := &http.Server{Addr: fmt.Sprintf(":%s", config.ListenerPort)}
	go func() {
		config.Logger.Info("server listening", "port", config.ListenerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			config.Logger.Error("failed to start server", "error", err.Error())
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// Start a goroutine to track in-flight requests
	shutdownComplete := make(chan struct{})
	go func() {
		inFlight.Wait()
		close(shutdownComplete)
	}()

	// Attempt graceful shutdown
	config.Logger.Info("shutting down server")
	if err := server.Shutdown(shutdownCtx); err != nil {
		config.Logger.Error("server shutdown error", "error", err.Error())
	}

	// Close the buffer channel and wait for processing to finish
	close(buffer)
	<-done
	config.Logger.Info("graceful shutdown complete")
}
