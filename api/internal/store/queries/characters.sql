-- name: ListCharacters :many
SELECT c.id, c.name, c.name_en, c.base_id, c.head, c.portrait, c.color,
	(SELECT count(*) FROM skills s WHERE s.char_id = c.id) AS skill_count
FROM characters c
ORDER BY (c.base_id IS NOT NULL), c.id;

-- name: GetCharacter :one
SELECT * FROM characters WHERE id = ?;

-- name: ListCharacterForms :many
-- Every other form sharing the same base character (base + its 7xxx variants).
SELECT id, name, head, color FROM characters
WHERE (base_id = sqlc.arg(base) OR id = sqlc.arg(base)) AND id != sqlc.arg(self)
ORDER BY id;

-- name: ListCharactersByIDs :many
SELECT id, name, head, color FROM characters WHERE id IN (sqlc.slice(ids)) ORDER BY id;
