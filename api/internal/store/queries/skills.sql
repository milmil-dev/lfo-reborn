-- name: ListSkills :many
SELECT s.id, s.char_id, s.slot, s.name, s.tier, s.mp, s.keys, s.chain, s.ultimate, s.icon,
	c.name AS char_name, c.head AS char_head, c.color AS char_color
FROM skills s
JOIN characters c ON c.id = s.char_id
ORDER BY (c.base_id IS NOT NULL), c.id, s.tier, s.slot;

-- name: ListSkillsByCharacter :many
SELECT * FROM skills WHERE char_id = ? ORDER BY tier, slot;
