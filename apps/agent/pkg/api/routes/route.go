package routes

import (
	"fmt"
	"net/http"
)

// Route 定义了一个 HTTP 路由
type Route struct {
	method  string        // HTTP 方法 (GET, POST 等)
	path    string        // 路由路径
	handler http.HandlerFunc // 处理函数
}

// NewRoute 创建一个新的路由
func NewRoute(method string, path string, handler http.HandlerFunc) *Route {
	return &Route{
		method:  method,
		path:    path,
		handler: handler,
	}
}

// Middeware 定义了中间件函数类型
type Middeware func(http.HandlerFunc) http.HandlerFunc

// WithMiddleware 为路由添加中间件
func (r *Route) WithMiddleware(mws ...Middeware) *Route {
	for _, mw := range mws {
		r.handler = mw(r.handler)
	}
	return r
}

// Register 将路由注册到 HTTP mux
func (r *Route) Register(mux *http.ServeMux) {
	mux.HandleFunc(fmt.Sprintf("%s %s", r.method, r.path), r.handler)
}

// Method 返回路由的 HTTP 方法
func (r *Route) Method() string {
	return r.method
}

// Path 返回路由的路径
func (r *Route) Path() string {
	return r.path
}
