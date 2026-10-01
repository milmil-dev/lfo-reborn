// Package db opens the pipeline-built SQLite database.
package db

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"

	_ "modernc.org/sqlite"
)

// OpenReadOnly opens data/lfo.db. The API never writes: the file is rebuilt by
// pipeline/build.ts, so read-only mode lets many connections read in parallel.
func OpenReadOnly(path string) (*sql.DB, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("database %s not found — run `make data` first: %w", path, err)
	}
	dsn := "file:" + (&url.URL{Path: path}).EscapedPath() + "?mode=ro&_pragma=query_only(1)"
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := conn.Ping(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return conn, nil
}
