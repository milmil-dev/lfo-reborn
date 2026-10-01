// Command server serves the LFO 圖鑑 API over data/lfo.db.
package main

import (
	"log/slog"
	"os"

	"github.com/lfo-wiki/api/internal/api"
	"github.com/lfo-wiki/api/internal/config"
	"github.com/lfo-wiki/api/internal/db"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	var level slog.Level
	_ = level.UnmarshalText([]byte(cfg.LogLevel))
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

	conn, err := db.OpenReadOnly(cfg.DBPath)
	if err != nil {
		logger.Error("open database", "err", err)
		os.Exit(1)
	}
	defer conn.Close()

	s := api.New(api.Deps{DB: conn, CORSOrigins: cfg.CORSOrigins, Logger: logger})
	addr := ":" + cfg.HTTPPort
	logger.Info("lfo api listening", "addr", addr, "db", cfg.DBPath)
	if err := s.Start(addr); err != nil {
		logger.Error("server", "err", err)
		os.Exit(1)
	}
}
