package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"

	"github.com/lfo-wiki/api/internal/api"
	"github.com/lfo-wiki/api/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests run against the real pipeline output; build it with `make data`.
const dbPath = "../../../data/lfo.db"

func newServer(t *testing.T) *api.Server {
	t.Helper()
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("data/lfo.db missing — run `make data`")
	}
	conn, err := db.OpenReadOnly(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	return api.New(api.Deps{DB: conn})
}

func get(t *testing.T, s *api.Server, path string, out any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	s.Echo.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	if out != nil && rec.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), out), rec.Body.String())
	}
	return rec.Code
}

func TestStats(t *testing.T) {
	s := newServer(t)
	var rows []struct {
		Kind string `json:"kind"`
		N    int    `json:"n"`
	}
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/stats", &rows))
	counts := map[string]int{}
	for _, r := range rows {
		counts[r.Kind] = r.N
	}
	assert.Greater(t, counts["characters"], 100)
	assert.Greater(t, counts["skills"], 500)
	assert.Greater(t, counts["equipment"], 500)
}

func TestCharacterDetail(t *testing.T) {
	s := newServer(t)
	var c struct {
		Name         string            `json:"name"`
		StatsDefault map[string]int    `json:"stats_default"`
		Skills       []map[string]any  `json:"skills"`
		Forms        []map[string]any  `json:"forms"`
		Prev         *struct{ ID int } `json:"prev"`
		Next         *struct{ ID int } `json:"next"`
	}
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/characters/2", &c))
	assert.Equal(t, "星奇", c.Name)
	assert.Equal(t, 1100, c.StatsDefault["hp"], "JSON columns are emitted as objects")
	assert.NotEmpty(t, c.Skills)
	assert.NotEmpty(t, c.Forms, "新生星奇 is listed as another form")
	require.NotNil(t, c.Prev)
	require.NotNil(t, c.Next)

	assert.Equal(t, http.StatusNotFound, get(t, s, "/api/v1/characters/999999", nil))
	assert.Equal(t, http.StatusBadRequest, get(t, s, "/api/v1/characters/abc", nil))
}

func TestItems(t *testing.T) {
	s := newServer(t)
	var rows []struct {
		ID   int            `json:"id"`
		Mods map[string]int `json:"mods"`
	}
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/items?kind=equipment", &rows))
	assert.Greater(t, len(rows), 500)
	assert.Equal(t, http.StatusBadRequest, get(t, s, "/api/v1/items?kind=nope", nil))

	var it struct {
		Name  string           `json:"name"`
		Users []map[string]any `json:"users"`
	}
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/items/620", &it))
	assert.Equal(t, "雅典娜盾", it.Name)
	assert.NotNil(t, it.Users)
}

func TestSearch(t *testing.T) {
	s := newServer(t)
	type hit struct {
		Kind string `json:"kind"`
		Name string `json:"name"`
	}
	var hits []hit
	// 3+ characters: FTS5 trigram
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/search?q="+url.QueryEscape("雅典娜"), &hits))
	assert.Contains(t, hits, hit{"equipment", "雅典娜盾"})
	// 2 characters: LIKE fallback
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/search?q="+url.QueryEscape("氣功"), &hits))
	assert.Contains(t, hits, hit{"skill", "氣功波"})
	// LIKE wildcards are escaped: "%" only matches names that literally contain it
	require.Equal(t, http.StatusOK, get(t, s, "/api/v1/search?q=%25", &hits))
	for _, h := range hits {
		assert.Contains(t, h.Name, "%")
	}
}

// The API serves data only; the static game assets are the frontend's (web/vite.config.ts).
func TestNoStaticFiles(t *testing.T) {
	s := newServer(t)
	assert.Equal(t, http.StatusNotFound, get(t, s, "/assets/dex/logo/lfo-hk.png", nil))
}
