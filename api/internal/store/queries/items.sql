-- name: ListItemsByKind :many
SELECT id, name, category, part, type, req_lv, req, mods, mod_total, durability, material, price, users, icon, color
FROM items
WHERE kind = ?
ORDER BY id;

-- name: GetItem :one
SELECT * FROM items WHERE id = ?;

-- name: CountEntities :many
SELECT 'characters' AS kind, count(*) AS n FROM characters
UNION ALL SELECT 'skills', count(*) FROM skills
UNION ALL SELECT kind, count(*) FROM items GROUP BY kind;
