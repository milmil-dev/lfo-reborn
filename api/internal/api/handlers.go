package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"sync"

	"github.com/labstack/echo/v5"
	"github.com/lfo-wiki/api/internal/store"
)

// The database is read-only for the lifetime of the process, so whole-table
// lists are loaded once and served from memory.
type listCache struct {
	characters func() ([]store.ListCharactersRow, error)
	skills     func() ([]store.ListSkillsRow, error)
	items      map[string]func() ([]store.ListItemsByKindRow, error)
	stats      func() ([]store.CountEntitiesRow, error)
}

func newListCache(q store.Querier) *listCache {
	ctx := context.Background()
	orEmpty := func(f func() ([]store.ListItemsByKindRow, error)) func() ([]store.ListItemsByKindRow, error) {
		return sync.OnceValues(f)
	}
	return &listCache{
		characters: sync.OnceValues(func() ([]store.ListCharactersRow, error) { return q.ListCharacters(ctx) }),
		skills:     sync.OnceValues(func() ([]store.ListSkillsRow, error) { return q.ListSkills(ctx) }),
		items: map[string]func() ([]store.ListItemsByKindRow, error){
			"equipment": orEmpty(func() ([]store.ListItemsByKindRow, error) { return q.ListItemsByKind(ctx, "equipment") }),
			"item":      orEmpty(func() ([]store.ListItemsByKindRow, error) { return q.ListItemsByKind(ctx, "item") }),
		},
		stats: sync.OnceValues(func() ([]store.CountEntitiesRow, error) { return q.CountEntities(ctx) }),
	}
}

func itoa(n int) string { return strconv.Itoa(n) }

func idParam(c *echo.Context) (int64, error) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 0 {
		return 0, fail(http.StatusBadRequest, "bad_id", "id must be a non-negative integer")
	}
	return id, nil
}

func loadFailed(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fail(http.StatusNotFound, "not_found", "not found")
	}
	return err
}

func (s *Server) handleStats(c *echo.Context) error {
	rows, err := s.lists.stats()
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, rows)
}

func (s *Server) handleListCharacters(c *echo.Context) error {
	rows, err := s.lists.characters()
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, rows)
}

type charRef struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	Head  *string `json:"head"`
	Color *string `json:"color"`
}

type characterDetail struct {
	store.Character
	Skills []store.Skill `json:"skills"`
	Forms  []charRef     `json:"forms"`
	Prev   *charRef      `json:"prev"`
	Next   *charRef      `json:"next"`
}

func (s *Server) handleGetCharacter(c *echo.Context) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	ch, err := s.q.GetCharacter(ctx, id)
	if err != nil {
		return loadFailed(err)
	}
	skills, err := s.q.ListSkillsByCharacter(ctx, id)
	if err != nil {
		return err
	}
	base := id
	if ch.BaseID != nil {
		base = *ch.BaseID
	}
	forms, err := s.q.ListCharacterForms(ctx, store.ListCharacterFormsParams{Base: &base, Self: id})
	if err != nil {
		return err
	}
	out := characterDetail{Character: ch, Skills: skills, Forms: make([]charRef, 0, len(forms))}
	if out.Skills == nil {
		out.Skills = []store.Skill{}
	}
	for _, f := range forms {
		out.Forms = append(out.Forms, charRef{f.ID, f.Name, f.Head, f.Color})
	}

	// previous / next in roster order (the same order as the list endpoint)
	all, err := s.lists.characters()
	if err != nil {
		return err
	}
	for i, r := range all {
		if r.ID != id {
			continue
		}
		if i > 0 {
			p := all[i-1]
			out.Prev = &charRef{p.ID, p.Name, p.Head, p.Color}
		}
		if i+1 < len(all) {
			n := all[i+1]
			out.Next = &charRef{n.ID, n.Name, n.Head, n.Color}
		}
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleListSkills(c *echo.Context) error {
	rows, err := s.lists.skills()
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, rows)
}

func (s *Server) handleListItems(c *echo.Context) error {
	load, ok := s.lists.items[c.QueryParam("kind")]
	if !ok {
		return fail(http.StatusBadRequest, "bad_kind", "kind must be equipment or item")
	}
	rows, err := load()
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, rows)
}

type itemDetail struct {
	store.Item
	Users []charRef `json:"users"`
}

func (s *Server) handleGetItem(c *echo.Context) error {
	id, err := idParam(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	it, err := s.q.GetItem(ctx, id)
	if err != nil {
		return loadFailed(err)
	}
	var ids []int64
	if err := json.Unmarshal(it.Users, &ids); err != nil {
		return err
	}
	out := itemDetail{Item: it, Users: []charRef{}}
	if len(ids) > 0 {
		users, err := s.q.ListCharactersByIDs(ctx, ids)
		if err != nil {
			return err
		}
		for _, u := range users {
			out.Users = append(out.Users, charRef{u.ID, u.Name, u.Head, u.Color})
		}
	}
	return c.JSON(http.StatusOK, out)
}
