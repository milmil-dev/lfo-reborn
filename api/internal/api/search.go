package api

import (
	"context"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/labstack/echo/v5"
)

// sqlc cannot parse FTS5 MATCH, so search is hand-written.

type searchHit struct {
	Kind  string  `json:"kind"` // character | equipment | item | skill
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	Meta  string  `json:"meta"`            // category, English name or owning character
	Image *string `json:"image"`           // icon / head
	Color *string `json:"color"`           // entity tint
	Owner *int64  `json:"owner,omitempty"` // skills: the character to link to
}

const perKind = 8

// matchRefs returns the ids (as stored in search.ref) of one entity kind matching q.
// The trigram tokenizer needs at least 3 characters; shorter queries use LIKE.
func (s *Server) matchRefs(ctx context.Context, q, kind string) ([]string, error) {
	var (
		sqlText string
		args    []any
	)
	if utf8.RuneCountInString(q) >= 3 {
		sqlText = "SELECT ref FROM search WHERE search MATCH ? AND kind = ? ORDER BY rank LIMIT ?"
		args = []any{`"` + strings.ReplaceAll(q, `"`, `""`) + `"`, kind, perKind}
	} else {
		like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
		sqlText = `SELECT ref FROM search WHERE kind = ? AND (name LIKE ? ESCAPE '\' OR description LIKE ? ESCAPE '\') LIMIT ?`
		args = []any{kind, like, like, perKind}
	}
	rows, err := s.db.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var refs []string
	for rows.Next() {
		var r string
		if err := rows.Scan(&r); err != nil {
			return nil, err
		}
		refs = append(refs, r)
	}
	return refs, rows.Err()
}

var hydrate = map[string]string{
	"character": `SELECT 'character', id, name, name_en, head, color, NULL FROM characters WHERE id = ?`,
	"equipment": `SELECT 'equipment', id, name, category, icon, color, NULL FROM items WHERE id = ?`,
	"item":      `SELECT 'item', id, name, category, icon, color, NULL FROM items WHERE id = ?`,
	"skill": `SELECT 'skill', s.id, s.name, c.name, s.icon, c.color, s.char_id
		FROM skills s JOIN characters c ON c.id = s.char_id WHERE s.id = ?`,
}

func (s *Server) handleSearch(c *echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" || utf8.RuneCountInString(q) > 64 {
		return c.JSON(http.StatusOK, []searchHit{})
	}
	ctx := c.Request().Context()
	hits := []searchHit{}
	for _, kind := range []string{"character", "equipment", "item", "skill"} {
		refs, err := s.matchRefs(ctx, q, kind)
		if err != nil {
			return err
		}
		for _, ref := range refs {
			var h searchHit
			err := s.db.QueryRowContext(ctx, hydrate[kind], ref).
				Scan(&h.Kind, &h.ID, &h.Name, &h.Meta, &h.Image, &h.Color, &h.Owner)
			if err != nil {
				continue // stale ref; the index is rebuilt with the data
			}
			hits = append(hits, h)
		}
	}
	return c.JSON(http.StatusOK, hits)
}
