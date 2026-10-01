// Package config loads settings from LFO_* environment variables.
package config

import (
	"strings"

	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/v2"
)

type Config struct {
	HTTPPort    string
	DBPath      string   // data/lfo.db produced by pipeline/build.ts
	CORSOrigins []string // extra browser origins allowed to call the API
	LogLevel    string
}

func Load() (Config, error) {
	k := koanf.New(".")
	defaults := map[string]any{
		"http_port":    "8080",
		"db_path":      "../data/lfo.db",
		"cors_origins": "http://localhost:5173",
		"log_level":    "info",
	}
	if err := k.Load(confmap.Provider(defaults, "."), nil); err != nil {
		return Config{}, err
	}
	// LFO_DB_PATH -> db_path
	if err := k.Load(env.Provider("LFO_", ".", func(key string) string {
		return strings.ToLower(strings.TrimPrefix(key, "LFO_"))
	}), nil); err != nil {
		return Config{}, err
	}

	var origins []string
	for _, o := range strings.Split(k.String("cors_origins"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	return Config{
		HTTPPort:    k.String("http_port"),
		DBPath:      k.String("db_path"),
		CORSOrigins: origins,
		LogLevel:    k.String("log_level"),
	}, nil
}
