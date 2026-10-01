-- Schema for data/lfo.db. Written by pipeline/build.ts, read by sqlc (api/sqlc.yaml).
-- The database is rebuilt from the original client on every pipeline run; the API opens it read-only.

CREATE TABLE characters (
	id INTEGER PRIMARY KEY,
	key TEXT NOT NULL,
	name TEXT NOT NULL,
	name_en TEXT NOT NULL DEFAULT '',
	base_id INTEGER,              -- 7xxx forms point at their base character
	hp INTEGER NOT NULL, mp INTEGER NOT NULL, dp INTEGER NOT NULL, ap INTEGER NOT NULL, st INTEGER NOT NULL,
	walk REAL NOT NULL, run REAL NOT NULL, jump_h REAL NOT NULL, jump_d REAL NOT NULL, weight REAL NOT NULL,
	stats_default TEXT NOT NULL,  -- json {hp,mp,sp,str,def,agi}
	stats_growth TEXT NOT NULL,
	stats_max TEXT NOT NULL,
	weapon_skill TEXT NOT NULL,   -- json {sword,spear,throw,heavy,bow,whip,wand}
	portrait TEXT,                -- image path under /assets
	head TEXT,
	faces TEXT NOT NULL,          -- json array of image paths
	color TEXT                    -- dominant colour of the art, #rrggbb
);

CREATE TABLE skills (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	char_id INTEGER NOT NULL REFERENCES characters(id),
	slot INTEGER NOT NULL,
	name TEXT NOT NULL,
	tier INTEGER NOT NULL,
	mp INTEGER NOT NULL,
	keys TEXT NOT NULL,           -- json array of inputs, e.g. ["GFA"]; G 防 A 攻 J 跳 F/B/U/D directions
	chain INTEGER NOT NULL DEFAULT 0,    -- 1 = follow-up input pressed during another move
	ultimate INTEGER NOT NULL DEFAULT 0,
	icon TEXT
);
CREATE INDEX skills_char ON skills(char_id);

CREATE TABLE items (
	id INTEGER PRIMARY KEY,
	key TEXT NOT NULL,
	name TEXT NOT NULL,
	description TEXT,
	kind TEXT NOT NULL,           -- 'equipment' | 'item'
	category TEXT NOT NULL,
	part INTEGER NOT NULL,
	type INTEGER NOT NULL,
	req_lv INTEGER NOT NULL,
	req TEXT NOT NULL,            -- json {hp,mp,sp,str,def,agi}
	mods TEXT NOT NULL,           -- json {hp,mp,sp,str,def,agi}
	mod_total INTEGER NOT NULL,
	durability INTEGER NOT NULL,
	material INTEGER NOT NULL,
	price INTEGER NOT NULL,
	users TEXT NOT NULL,          -- json array of character ids; empty = anyone
	icon TEXT,
	color TEXT
);
CREATE INDEX items_kind ON items(kind, category);

-- Full-text search over every entity. trigram needs >= 3 characters; shorter queries use LIKE.
CREATE VIRTUAL TABLE search USING fts5(name, description, kind UNINDEXED, ref UNINDEXED, tokenize = 'trigram');
