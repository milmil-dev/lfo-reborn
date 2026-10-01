// Exports everything one story needs to be replayed 1:1 in the web client:
//   data/assets/game/stories/<story>.json   stage events, enemy groups, map rooms, scripts, dialogue
//   data/assets/game/bg/<file>.webp          background layers used by the map's rooms
//   data/assets/game/sprites/<id>.json/.png  NPCs, creatures, items and special objects it spawns
//   data/assets/game/faces/<base>_<nn>.png   dialogue portraits
// Usage: bun stories.ts stinky_school [...]
import { copyFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { composite, imageBytes, readPak, readStrings, SRC, unpackLfo } from "./lfo";
import { exportSprite, imageSource, parseSpt, refreshFrames, zpak, zpakSource } from "./sprite-lib";

const ROOT = `${import.meta.dir}/..`;
const OUT = `${ROOT}/data/assets/game`;

const [story, map, bg, script, talk, str, ls, pak] = await Promise.all([
	unpackLfo("story.lfo"),
	unpackLfo("map.lfo"),
	unpackLfo("bg.lfo"),
	unpackLfo("script.lfo"),
	unpackLfo("talk.lfo"),
	unpackLfo("hk/string.lfo", "string_hk"),
	unpackLfo("loadsprite.lfo"),
	unpackLfo("pak.lfo"),
]);
const archives: Record<string, string> = {
	spe: await unpackLfo("spe.lfo"),
	spec: await unpackLfo("spec.lfo"),
	spen: await unpackLfo("spen.lfo"),
	spew: await unpackLfo("spew.lfo"),
	spes: await unpackLfo("spes.lfo"),
	speb: await unpackLfo("speb.lfo"),
};
for (const d of ["stories", "bg", "sprites", "faces", "sfx", "bgm"]) await mkdir(`${OUT}/${d}`, { recursive: true });

/* ───────── helpers ───────── */

/** Case-insensitive file lookup under a directory, ignoring the _TW (Taiwan) copies. */
const fileIndex = new Map<string, Map<string, string>>();
function findFile(dir: string, rel: string) {
	let idx = fileIndex.get(dir);
	if (!idx) {
		idx = new Map();
		for (const f of new Bun.Glob("**/*").scanSync(dir)) if (!/(^|\/)_tw\//i.test(f)) idx.set(f.toLowerCase(), `${dir}/${f}`);
		fileIndex.set(dir, idx);
	}
	return idx.get(rel.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase());
}
const byBasename = (dir: string, name: string) => {
	findFile(dir, "");
	for (const [k, v] of fileIndex.get(dir)!) if (k.endsWith(`/${name.toLowerCase()}`)) return v;
	return undefined;
};
const text16 = async (path: string) => {
	const b = new Uint8Array(await Bun.file(path).arrayBuffer());
	return b[0] === 0xff && b[1] === 0xfe ? new TextDecoder("utf-16le").decode(b).replace(/^﻿/, "") : new TextDecoder("latin1").decode(b);
};
const rows = (text: string) =>
	text
		.replace(/\r/g, "")
		.split("\n")
		.map((l) => l.replace(/\/\/.*$/, "").trim())
		.filter(Boolean)
		.map((l) => l.split(/\s+/));

/* ───────── sprite registry (loadsprite*.dat: id -> folder/name.spz) ───────── */

const spriteDef = new Map<number, { folder: string; name: string; player: boolean }>();
for (const f of new Bun.Glob("**/loadsprite*.dat").scanSync(ls)) {
	for (const [id, path] of rows(await Bun.file(`${ls}/${f}`).text())) {
		const m = path?.replace(/\\/g, "/").match(/^(.+)\/([^/]+)\.sp[zt]$/i);
		if (m && !spriteDef.has(Number(id))) spriteDef.set(Number(id), { folder: m[1].toLowerCase(), name: m[2].toLowerCase(), player: f.endsWith("loadsprite.dat") });
	}
}
const playerIndex: { key: string; id: number }[] = (await Bun.file(`${OUT}/chars/index.json`).exists()) ? await Bun.file(`${OUT}/chars/index.json`).json() : [];

function sptPath(id: number) {
	const def = spriteDef.get(id);
	if (!def) return undefined;
	for (const dir of Object.values(archives)) {
		const p = findFile(dir, `${def.folder}/${def.name}.spt`) ?? byBasename(dir, `${def.name}.spt`);
		if (p) return p;
	}
	return undefined;
}

const exported = new Map<number, string | null>(); // sprite id -> asset path ("chars/stinky" | "sprites/3002")
const sounds = new Set<string>();

async function ensureSprite(id: number): Promise<string | null> {
	if (exported.has(id)) return exported.get(id)!;
	const player = playerIndex.find((p) => p.id === id);
	if (player) {
		exported.set(id, `chars/${player.key}`);
		return `chars/${player.key}`;
	}
	const path = sptPath(id);
	if (!path) {
		console.warn(`  no .spt for sprite ${id}`);
		exported.set(id, null);
		return null;
	}
	const spt = parseSpt(await Bun.file(path).text());
	// player-style characters outside the main index (e.g. ricky_a) have their own pak folder
	const def = spriteDef.get(id)!;
	const pakPath = findFile(pak, `${def.folder.toUpperCase()}/${def.name}.pak`) ?? byBasename(pak, `${def.name}.pak`);
	const { pakByIdSource } = await import("./sprite-lib");
	const source = pakPath && !pakPath.includes("/ZPAK/") ? await pakByIdSource(pakPath) : await zpakSource(spt);
	const r = await exportSprite({ dir: `${OUT}/sprites`, key: String(id), spt, source, extra: { id } });
	const out = r ? `sprites/${id}` : null;
	// register before following spawned objects: projectiles can spawn each other
	exported.set(id, out);
	console.log(`  sprite ${id} ${def.folder}/${def.name} -> ${out ?? "(no pictures)"}`);
	if (r) for (const s of r.sounds) sounds.add(s);
	if (r) for (const f of Object.values(spt.frames)) for (const b of f.bla ?? []) if (b.type) await ensureSprite(b.type);
	return out;
}

/* ───────── faces ───────── */

const facePak = await readPak(`${pak}/ZPAK/FACE/face.pak`);
const faceDone = new Map<string, string | null>();
async function ensureFace(spriteId: number, face: number): Promise<string | null> {
	const def = spriteDef.get(spriteId);
	if (!def || face <= 0) return null;
	const nn = String(face).padStart(2, "0");
	for (const base of [def.name, def.name.replace(/_[a-z0-9]+$/, ""), def.name.replace(/[a-z]$/, "")]) {
		const key = `${base}_${nn}`;
		if (faceDone.has(key)) return faceDone.get(key)!;
		const pieces = facePak.get(`pic/${key}.png`);
		if (!pieces) continue;
		const png = await composite(pieces, "face", { trim: true });
		await Bun.write(`${OUT}/faces/${key}.png`, png);
		faceDone.set(key, `faces/${key}.png`);
		return `faces/${key}.png`;
	}
	return null;
}

/* ───────── background rooms ───────── */

const bgImages = new Set<string>();
/**
 * A room's animated objects (bgo rows naming a .spt / .spe: shopkeepers, clouds, spinning signs)
 * are small sprites of their own; exported once as sprites/bg_<name> and played by the room.
 */
const bgSprites = new Map<string, string | null>();
async function ensureBgSprite(name: string, bgDir: string) {
	const base = name.replace(/\.sp[te]$/i, "");
	if (bgSprites.has(base)) return bgSprites.get(base)!;
	const path = findFile(archives.speb, `${bgDir}/${base}.spt`) ?? byBasename(archives.speb, `${base}.spt`);
	let out: string | null = null;
	if (path) {
		const spt = parseSpt(await Bun.file(path).text());
		const key = `bg_${base.toLowerCase()}`;
		// pictures as plain images, else the object's own atlas (BG/…/<name>.pak), else the ZPAK packs
		const { pakByIdSource } = await import("./sprite-lib");
		const ownPak = findFile(pak, `${bgDir}/${base}.pak`) ?? byBasename(pak, `${base}.pak`);
		for (const source of [
			() => imageSource(spt),
			...(ownPak ? [() => pakByIdSource(ownPak)] : []),
			() => zpakSource(spt),
		]) {
			const r = await exportSprite({ dir: `${OUT}/sprites`, key, spt, source: await source() });
			if (r) {
				out = `sprites/${key}`;
				break;
			}
		}
	}
	bgSprites.set(base, out);
	if (!out) console.warn("  no sprite for bg object", name);
	return out;
}

async function exportBg(file: string) {
	const path = findFile(bg, file.replace(/\.bz$/i, ".bg").replace(/^\.\/bg\//i, "BG/"));
	if (!path) {
		console.warn("  missing bg", file);
		return null;
	}
	const room = { name: "", width: 0, upper: 0, lower: 0, friction: 1, layers: [] as unknown[], entries: [] as unknown[], exits: [] as unknown[], walls: [] as unknown[] };
	for (const r of rows(await Bun.file(path).text())) {
		const n = (i: number) => Number(r[i] ?? 0);
		switch (r[0]) {
			case "bgd":
				Object.assign(room, { name: r[1], width: n(3), upper: n(4), lower: n(5), friction: n(6) });
				break;
			case "bgp":
			case "bgo": {
				const raw = r[1].toLowerCase();
				// pictures are named relative to the room's folder ("../coliseum6sky.png",
				// "../lantau/…"), but the image packs index them by bare file name
				const img = /\.sp[te]$/.test(raw) ? raw : raw.split(/[\\/]/).pop()!;
				// x y z xratio span xoffset yoffset behaviour portal
				const layer: Record<string, unknown> = { img, x: n(2), y: n(3), z: n(4), ratio: n(5), span: n(6), step: n(7), dy: n(8), fn: n(9), portal: n(10), object: r[0] === "bgo" };
				if (/\.sp[te]$/.test(img)) {
					const sprite = await ensureBgSprite(img, path.slice(bg.length + 1).split("/").slice(0, -1).join("/"));
					if (sprite) layer.sprite = sprite;
				} else bgImages.add(img);
				room.layers.push(layer);
				break;
			}
			case "pen":
				room.entries.push({ link: n(1), x: n(2), z: n(3) });
				break;
			case "pex":
				room.exits.push({ link: n(1), x: n(2), z: n(3), w: n(4), h: n(5), dir: n(6) });
				break;
			case "poy": {
				// count, then (x, z, edge flag) per corner — the flag belongs to the edge from this
				// corner to the next (0 = open, anything else blocks) — then the bounding box
				const count = n(1);
				const pts: [number, number, number][] = [];
				for (let i = 0; i < count; i++) pts.push([n(2 + i * 3), n(3 + i * 3), n(4 + i * 3)]);
				if (pts.some((p) => p[2] !== 0)) room.walls.push(pts);
				break;
			}
		}
	}
	return room;
}

async function writeBgImage(img: string) {
	const out = `${OUT}/bg/${img.replace(/\.(png|jpe?g|bmp|tga)$/i, ".webp")}`;
	if (await Bun.file(out).exists()) return true;
	let bytes = await imageBytes(img);
	if (!bytes) {
		const z = (await zpak()).get(img) ?? (await zpak()).get(`bg/${img}`);
		if (z) bytes = await composite(z.pieces, z.prefix);
	}
	if (!bytes) return false;
	await mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true });
	await sharp(bytes).webp({ quality: 90, alphaQuality: 100 }).toFile(out);
	return true;
}

/* ───────── scripts + dialogue ───────── */

async function parseScript(rel: string) {
	const path = findFile(script, rel);
	if (!path) {
		console.warn("  missing script", rel);
		return [];
	}
	const cmds: (string | number)[][] = [];
	for (const raw of (await text16(path)).split(/\r?\n/)) {
		const line = raw.replace(/;.*$/, "").trim();
		if (!line) continue;
		const parts = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]));
		const [cmd, ...args] = parts;
		cmds.push([cmd.toLowerCase(), ...args.map((a) => (/^-?\d+(\.\d+)?$/.test(a) ? Number(a) : a))]);
		if (cmd.toLowerCase() === "playmusic") bgm.add(String(args[0]).split(/[\\/]/).pop()!.toLowerCase());
		if (cmd.toLowerCase() === "playsound") sounds.add(String(args[0]).split(/[\\/]/).pop()!.toLowerCase());
	}
	return cmds;
}
const bgm = new Set<string>();

async function parseTalk(area: string, key: string) {
	const tlk = findFile(talk, `STORY/${area}/${key}_talk.tlk`);
	const strings = findFile(str, `STORY/${area}/${key}_string.tzw`);
	if (!tlk || !strings) return {};
	const text = await readStrings(strings);
	const events: Record<number, { sprite: number; face: number; text: string; portrait: string | null }[]> = {};
	let cur: (typeof events)[number] | null = null;
	for (const r of rows(await Bun.file(tlk).text())) {
		if (r[0].startsWith("~")) continue;
		if (r.length === 2) {
			cur = events[Number(r[0])] = [];
			continue;
		}
		if (r.length >= 3 && cur) {
			const [sprite, face, sid] = r.map(Number);
			cur.push({ sprite, face, text: text.get(sid) ?? "", portrait: sprite > 0 ? await ensureFace(sprite, face) : null });
		}
	}
	return events;
}

/* ───────── story ───────── */

async function exportStory(key: string) {
	const styPath = byBasename(story, `${key}.sty`);
	if (!styPath) throw new Error(`no ${key}.sty`);
	const area = styPath.split("/").slice(-2, -1)[0];
	const groups: Record<number, { sprite: number; level: number; qty: number; exp: number; hpMul: number; team: number }[]> = {};
	const scripts: string[] = [];
	const events: number[][] = [];
	const loot: { sprite: number; p: number }[] = [];
	let mapId = 0;
	// the stage's own music (VS stages and towers have no script that plays any)
	let bgm: string | null = null;
	let gid = -1;
	for (const r of rows(await Bun.file(styPath).text())) {
		const n = (i: number) => Number(r[i] ?? 0);
		if (r[0] === "map") mapId = n(1);
		else if (r[0] === "bgm" && r[1]) bgm = r[1].split(/[\\/]/).pop()!.toLowerCase();
		else if (r[0] === "egrp_id") gid = n(1);
		else if (r[0] === "egrp_eny") (groups[gid] ??= []).push({ sprite: n(1), level: n(2), qty: n(3), exp: n(4), hpMul: n(5) || 1, team: n(7) });
		else if (r[0] === "sct") scripts.push(r[1]);
		else if (r[0] === "evt") events.push(r.slice(1).map(Number));
		// the stage's loot table: sprite id and drop weight (field items and equipment alike)
		else if (r[0] === "itm") loot.push({ sprite: n(2), p: n(3) });
	}

	// the map with this id
	// several files can declare the same map id (e.g. school_temp.map); keep the fullest one
	let mapRows: string[][] | null = null;
	for (const f of new Bun.Glob("MAP/**/*.map").scanSync(map)) {
		if (/(^|\/)_tw\//i.test(f)) continue;
		const rs = rows(await Bun.file(`${map}/${f}`).text());
		if (!rs.some((r) => r[0] === "map" && Number(r[2]) === mapId)) continue;
		const count = (x: string[][]) => x.filter((r) => r[0] === "bgd").length;
		if (!mapRows || count(rs) > count(mapRows)) mapRows = rs;
	}
	if (!mapRows) throw new Error(`map ${mapId} not found`);
	const rooms: Record<number, unknown> = {};
	const links: Record<number, { link: number; toBg: number; toLink: number }[]> = {};
	let start = { bg: 0, x: 0, facing: 0 };
	let curBg = -1;
	for (const r of mapRows) {
		const n = (i: number) => Number(r[i] ?? 0);
		if (r[0] === "stp") start = { bg: n(1), x: n(2), facing: n(3) };
		else if (r[0] === "bgd") {
			curBg = n(1);
			const room = await exportBg(r[2]);
			if (room) rooms[curBg] = room;
		} else if (r[0] === "lnk") (links[curBg] ??= []).push({ link: n(1), toBg: n(2), toLink: n(3) });
	}
	// a stage the client lists but never finished (p14s9's map has no rooms) isn't playable
	if (!Object.keys(rooms).length) throw new Error(`map ${mapId} has no rooms`);
	let missing = 0;
	for (const img of bgImages) if (!(await writeBgImage(img))) missing++;
	if (missing) console.warn(`  ${missing} background images not found`);

	const scriptCmds = [];
	for (const s of scripts) scriptCmds.push({ file: s, cmds: await parseScript(s) });
	const dialogue = await parseTalk(area, key);

	// every sprite the story can put on screen
	const ids = new Set<number>();
	for (const g of Object.values(groups)) for (const e of g) ids.add(e.sprite);
	for (const s of scriptCmds)
		for (const c of s.cmds) {
			if ((c[0] === "add" || c[0] === "addex") && typeof c[2] === "number") ids.add(c[2]);
			if (c[0] === "changesprite" && typeof c[2] === "number") ids.add(c[2]);
		}
	for (const lines of Object.values(dialogue)) for (const l of lines) if (l.sprite > 0) ids.add(l.sprite);
	const sprites: Record<number, string | null> = {};
	for (const id of ids) sprites[id] = await ensureSprite(id);

	for (const b of bgm) {
		const src = [...new Bun.Glob("*").scanSync(`${SRC}/BGM`)].find((n) => n.toLowerCase() === b);
		if (src) await copyFile(`${SRC}/BGM/${src}`, `${OUT}/bgm/${b}`);
	}
	for (const s of sounds) {
		const src = [...new Bun.Glob("*").scanSync(`${SRC}/SFX`)].find((n) => n.toLowerCase() === s);
		if (src && !(await Bun.file(`${OUT}/sfx/${s}`).exists())) await copyFile(`${SRC}/SFX/${src}`, `${OUT}/sfx/${s}`);
	}

	const nameTable = await readStrings(`${str}/STORY/MISC/name.tzw`);
	const names: Record<number, string> = {};
	for (const id of ids) {
		const n = nameTable.get(id);
		if (n && n !== "-") names[id] = n;
	}
	await Bun.write(`${OUT}/stories/${key}.json`, JSON.stringify({ key, area, mapId, bgm, start, rooms, links, groups, events, scripts: scriptCmds, dialogue, sprites, names, loot }));
	console.log(`${key}: rooms ${Object.keys(rooms).length}, events ${events.length}, scripts ${scriptCmds.length}, dialogue ${Object.keys(dialogue).length}, sprites ${ids.size}, bg images ${bgImages.size}`);
}

/** A walkable map with no story attached (the lobby): rooms + links only, same shape as a story. */
async function exportMap(file: string, key: string) {
	const mapRows = rows(await Bun.file(`${map}/${file}`).text());
	const rooms: Record<number, unknown> = {};
	const links: Record<number, { link: number; toBg: number; toLink: number }[]> = {};
	let start = { bg: 0, x: 0, facing: 0 };
	let mapId = 0;
	let curBg = -1;
	for (const r of mapRows) {
		const n = (i: number) => Number(r[i] ?? 0);
		if (r[0] === "map") mapId = n(2);
		else if (r[0] === "stp") start = { bg: n(1), x: n(2), facing: n(3) };
		else if (r[0] === "bgd") {
			curBg = n(1);
			const room = await exportBg(r[2]);
			if (room) rooms[curBg] = room;
		} else if (r[0] === "lnk") (links[curBg] ??= []).push({ link: n(1), toBg: n(2), toLink: n(3) });
	}
	let missing = 0;
	for (const img of bgImages) if (!(await writeBgImage(img))) missing++;
	if (missing) console.warn(`  ${missing} background images not found`);
	const empty = { groups: {}, events: [], scripts: [], dialogue: {}, sprites: {}, names: {} };
	await Bun.write(`${OUT}/stories/${key}.json`, JSON.stringify({ key, area: "lobby", mapId, start, rooms, links, ...empty }));
	console.log(`${key}: rooms ${Object.keys(rooms).length}, bg images ${bgImages.size}`);
}

/** Every skill effect / projectile any playable character can spawn (the .spt `bla` rows). */
async function exportEffects() {
	for (const { key } of playerIndex) {
		const data = await Bun.file(`${OUT}/chars/${key}.json`).json();
		for (const f of Object.values(data.frames) as { bla?: { type: number }[] }[])
			for (const b of f.bla ?? []) if (b.type) await ensureSprite(b.type);
	}
	await mkdir(`${OUT}/sfx`, { recursive: true });
	const sfx = [...new Bun.Glob("*").scanSync(`${SRC}/SFX`)];
	for (const s of sounds) {
		const src = sfx.find((n) => n.toLowerCase() === s);
		if (src && !(await Bun.file(`${OUT}/sfx/${s}`).exists())) await copyFile(`${SRC}/SFX/${src}`, `${OUT}/sfx/${s}`);
	}
	console.log(`effects: ${[...exported.values()].filter(Boolean).length} sprites`);
}

/** Every item that can lie in the field (weapons, heavy objects, throwables, potions, shields, bows, arrows). */
const FIELD_TYPES = new Set([100, 200, 300, 400, 500, 600, 900, 1000]);
async function exportItems() {
	const index: { id: number; type: number }[] = [];
	for (const [id] of [...spriteDef].sort((a, b) => a[0] - b[0])) {
		if (id < 100 || id >= 1000) continue;
		const path = sptPath(id);
		if (!path) continue;
		const type = parseSpt(await Bun.file(path).text()).attrs.type;
		if (FIELD_TYPES.has(type) && (await ensureSprite(id))) index.push({ id, type });
	}
	// every field item the client can show, for drops and the training ground
	await Bun.write(`${OUT}/sprites/items.json`, JSON.stringify(index));
	console.log(`items: ${index.length} field items`);
}

/**
 * 兇獸突襲: the seven beasts (creature/Bestial_1–7, sprites 4001–4007) and the 魔精石 each one
 * carries (weapon/bestialStone1–7, items 5136–5142), with their names from the name table.
 *   data/assets/game/beasts.json  [{ sprite, stone, name }]
 */
async function exportBeasts() {
	const nameTable = await readStrings(`${str}/STORY/MISC/name.tzw`);
	const out: { sprite: number; stone: number; name: string }[] = [];
	for (let i = 0; i < 7; i++) {
		const sprite = 4001 + i;
		if (!(await ensureSprite(sprite))) continue;
		out.push({ sprite, stone: 5136 + i, name: nameTable.get(sprite) ?? `兇獸${i + 1}` });
	}
	await Bun.write(`${OUT}/beasts.json`, JSON.stringify(out));
	console.log(`beasts: ${out.map((b) => b.name).join(" ")}`);
}

/** Re-read the .spt frame data of every exported sprite (atlases untouched). */
async function refreshSpriteFrames() {
	let n = 0;
	for (const f of new Bun.Glob("*.json").scanSync(`${OUT}/sprites`)) {
		const path = sptPath(Number(f.replace(/\.json$/, "")));
		if (!path) continue;
		await refreshFrames(`${OUT}/sprites/${f}`, parseSpt(await Bun.file(path).text()));
		n++;
	}
	console.log(`sprites: ${n} frame sets refreshed`);
}

const args = process.argv.slice(2);
if (args.includes("--frames")) await refreshSpriteFrames();
if (args.includes("--items")) await exportItems();
if (args.includes("--effects")) await exportEffects();
if (args.includes("--beasts")) await exportBeasts();
if (args.includes("--lobby")) await exportMap("MAP/LOBBY/Newlobby.map", "lobby");
// the street lobby of the later (TW_) client: 8 rooms of tw_newLobby_* art
if (args.includes("--lobby-tw")) await exportMap("MAP/LOBBY/TW_Newlobby.map", "lobby_tw");
// --all: every story line, mission and VS stage of the client's list (catalog.ts writes it first)
const storyKeys = args.includes("--all")
	? ((await Bun.file(`${OUT}/stories/catalog.json`).json()) as { key: string; mode: string }[])
			.filter((e) => e.mode !== undefined)
			.map((e) => e.key)
	: args.filter((a) => !a.startsWith("--"));
const failed: string[] = [];
for (const key of storyKeys.length ? storyKeys : args.length ? [] : ["stinky_school"]) {
	// one broken script shouldn't stop the other lines from exporting
	try {
		await exportStory(key);
	} catch (e) {
		failed.push(key);
		console.error(`${key}: FAILED ${(e as Error).message}`);
	}
}
if (failed.length) console.error(`failed: ${failed.join(" ")}`);

// which story lines exist, for the stage select (everything but the lobby map)
const exportedStories = [...new Bun.Glob("*.json").scanSync(`${OUT}/stories`)]
	.map((f) => f.replace(/\.json$/, ""))
	.filter((k) => k !== "index" && k !== "lobby")
	.sort();
await Bun.write(`${OUT}/stories/index.json`, JSON.stringify(exportedStories));
