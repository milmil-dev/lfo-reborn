// Package api serves the 圖鑑 data over HTTP.
package api

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"syscall"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/lfo-wiki/api/internal/store"
	"github.com/lfo-wiki/api/openapi"
)

type Deps struct {
	DB          *sql.DB
	CORSOrigins []string
	Logger      *slog.Logger
}

type Server struct {
	Echo   *echo.Echo
	q      store.Querier
	db     *sql.DB
	logger *slog.Logger
	lists  *listCache
}

func New(deps Deps) *Server {
	lg := deps.Logger
	if lg == nil {
		lg = slog.Default()
	}
	e := echo.New()
	e.Logger = lg
	e.HTTPErrorHandler = errorHandler
	e.Use(middleware.RequestID())
	e.Use(middleware.Recover())
	if len(deps.CORSOrigins) > 0 {
		origins := deps.CORSOrigins
		e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
			UnsafeAllowOriginFunc: func(_ *echo.Context, origin string) (string, bool, error) {
				return origin, slices.Contains(origins, origin), nil
			},
			AllowMethods: []string{http.MethodGet, http.MethodHead, http.MethodOptions},
			MaxAge:       600,
		}))
	}

	q := store.New(deps.DB)
	s := &Server{Echo: e, q: q, db: deps.DB, logger: lg, lists: newListCache(q)}

	e.GET("/healthz", func(c *echo.Context) error { return c.JSON(http.StatusOK, map[string]string{"status": "ok"}) })
	e.GET("/openapi.yaml", func(c *echo.Context) error { return c.Blob(http.StatusOK, "application/yaml", openapi.Spec) })

	v1 := e.Group("/api/v1", cacheFor(time.Minute))
	v1.GET("/stats", s.handleStats)
	v1.GET("/characters", s.handleListCharacters)
	v1.GET("/characters/:id", s.handleGetCharacter)
	v1.GET("/skills", s.handleListSkills)
	v1.GET("/items", s.handleListItems)
	v1.GET("/items/:id", s.handleGetItem)
	v1.GET("/search", s.handleSearch)
	return s
}

func cacheFor(d time.Duration) echo.MiddlewareFunc {
	value := "public, max-age=" + itoa(int(d.Seconds()))
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			c.Response().Header().Set("Cache-Control", value)
			return next(c)
		}
	}
}

// Start serves until SIGINT/SIGTERM, then drains in-flight requests.
func (s *Server) Start(addr string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return echo.StartConfig{
		Address:         addr,
		HideBanner:      true,
		HidePort:        true,
		GracefulTimeout: 10 * time.Second,
	}.Start(ctx, s.Echo)
}

/* ───────── errors ───────── */

type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string { return e.Message }

func fail(status int, code, msg string) *APIError {
	return &APIError{Status: status, Code: code, Message: msg}
}

func errorHandler(c *echo.Context, err error) {
	if res, _ := echo.UnwrapResponse(c.Response()); res != nil && res.Committed {
		return
	}
	if apiErr, ok := errors.AsType[*APIError](err); ok {
		_ = c.JSON(apiErr.Status, map[string]any{"error": apiErr})
		return
	}
	if sc := echo.HTTPStatusCoder(nil); errors.As(err, &sc) {
		code := sc.StatusCode()
		_ = c.JSON(code, map[string]any{"error": APIError{Code: "http", Message: http.StatusText(code)}})
		return
	}
	c.Logger().Error("unhandled error", "err", err, "path", c.Request().URL.Path)
	_ = c.JSON(http.StatusInternalServerError, map[string]any{"error": APIError{Code: "internal", Message: "internal error"}})
}
