// Command export writes the API's read-only responses as static JSON files, so
// the deployed site can serve its data the same way it serves art: as free,
// unmetered static assets, with no server behind /api.
//
// Every response comes from the real handlers (run in-process through
// httptest), so a file is byte-for-byte what the live endpoint returns.
// A request path maps to a file under -out (data/assets/api/v1 by default):
//
//	/characters               -> characters.json
//	/characters/123           -> characters/123.json
//	/items?kind=equipment     -> items/kind/equipment.json
//
// web/src/lib/api.ts applies the same mapping. /search is not exported: it
// takes free-form queries and no screen uses it.
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/lfo-wiki/api/internal/api"
	"github.com/lfo-wiki/api/internal/db"
)

func main() {
	dbPath := flag.String("db", "../data/lfo.db", "database built by the pipeline")
	out := flag.String("out", "../data/assets/api/v1", "directory to write the JSON files into")
	flag.Parse()

	if err := run(*dbPath, *out); err != nil {
		slog.Error("export", "err", err)
		os.Exit(1)
	}
}

func run(dbPath, out string) error {
	conn, err := db.OpenReadOnly(dbPath)
	if err != nil {
		return err
	}
	defer conn.Close()

	paths := []string{"/stats", "/characters", "/skills", "/items?kind=equipment", "/items?kind=item"}
	for _, table := range []string{"characters", "items"} {
		ids, err := listIDs(conn, table)
		if err != nil {
			return err
		}
		for _, id := range ids {
			paths = append(paths, fmt.Sprintf("/%s/%d", table, id))
		}
	}

	// Start from an empty directory so ids that left the database leave the site too.
	if err := os.RemoveAll(out); err != nil {
		return err
	}
	s := api.New(api.Deps{DB: conn, Logger: slog.New(slog.DiscardHandler)})
	for _, p := range paths {
		rec := httptest.NewRecorder()
		s.Echo.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1"+p, nil))
		if rec.Code != http.StatusOK {
			return fmt.Errorf("GET %s: %d %s", p, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
		file := filepath.Join(out, filepath.FromSlash(staticPath(p)))
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(file, rec.Body.Bytes(), 0o644); err != nil {
			return err
		}
	}
	slog.Info("exported", "files", len(paths), "out", out)
	return nil
}

// staticPath maps "/items?kind=item" to "items/kind/item.json".
func staticPath(p string) string {
	u, err := url.Parse(p)
	if err != nil {
		panic(err) // paths are built above
	}
	rel := strings.TrimPrefix(u.Path, "/")
	for key, vals := range u.Query() {
		rel += "/" + key + "/" + vals[0]
	}
	return rel + ".json"
}

func listIDs(conn *sql.DB, table string) ([]int64, error) {
	rows, err := conn.Query("SELECT id FROM " + table + " ORDER BY id") // table is one of two literals
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
