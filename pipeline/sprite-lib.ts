// Shared sprite export: .spt frame data + packed atlases, for any object in the game
// (player characters, NPCs, creatures, weapons/items, special objects).
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { imageBytes, type Piece, readPak, unpackLfo } from "./lfo";

const PAGE = 2048;
// transparent space between packed pictures: wide enough that upscaling a page (game-hd.ts)
// never bleeds one frame into its neighbour
const GUTTER = 6;

/* ───────── .spt → frame data ───────── */

export type Box = [x: number, y: number, w: number, h: number];
export type Atk = { box: Box; hp: number; fall: number; dizzy: number; dx: number; dy: number; dz: number; effect: number };
/** A spawned object: type, spawn point on the frame canvas (x, y) and depth (z), launch velocity (mx, my, mz), start action (aid), hp, facing. */
export type Bla = { type: number; x: number; y: number; z: number; mx: number; my: number; mz: number; aid: number; hp: number; facing: number };
/**
 * Weapon point: where a held item sits in this frame. type 100 hand weapon, 200 heavy object
 * overhead, 500 potion, 900 bow; z > 0 in front of the body; o = rotation (radians); dx/dy/dz =
 * throw velocity (non-zero on the frame that lets go); aid = the item's action to show
 * (0 held, 100 / 110 … its attack frames with hit boxes, 300 / 310 bow draw / release).
 */
export type Eff = { part: number; x: number; y: number; z: number; o: number; aid: number };
export type Wpn = { type: number; x: number; y: number; z: number; o: number; dx: number; dy: number; dz: number; aid: number; facing: number };
export type Frame = {
	n: string; // comment / animation name
	s: number; // state
	p: number; // picture id
	cx: number;
	cy: number;
	d: number; // duration in ticks
	nx: number; // next frame (-1 = back to the default action)
	dvx: number;
	dvy: number;
	dvz: number;
	bdy?: Box[];
	atk?: Atk[];
	bla?: Bla[]; // objects spawned by this frame (projectiles, effects)
	wpn?: Wpn;
	/** 摩摩星 paper-doll layers: draw part slot `part` (10000 body, 20000 head, 30000 face, 40000 backpack, 50000 skin) in its action `aid` at (x, y) */
	eff?: Eff[];
	snd?: string;
};
export type Move = { keys: string[]; mp: number; from: number; to: number; slot: number; fx?: number[] };

export type Spt = ReturnType<typeof parseSpt>;

export function parseSpt(text: string) {
	const lines = text.replace(/\r/g, "").split("\n");
	const frames: Record<number, Frame> = {};
	const actions: Record<string, number> = {}; // action name -> start frame
	const actionFrame: Record<number, number> = {}; // action id -> start frame
	const moves: Move[] = [];
	const pics = new Map<number, string>(); // picture id -> atlas file name (non-player objects)
	const mpi: Record<string, string> = {}; // 摩摩星 parts: their mpi rows
	let chr: string[] = [];
	let cur: Frame | null = null;
	let inPic = false;
	/** act rows: [action id, the action it continues into] */
	const actNext: [number, number][] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith("//")) continue;
		if (line === "pic") {
			inPic = true;
			continue;
		}
		if (inPic) {
			const m = line.match(/^(-?\d+)\s+(\S+)/);
			if (m) {
				pics.set(Number(m[1]), m[2].replace(/\\/g, "/").toLowerCase());
				continue;
			}
			inPic = false;
		}
		const [tag, ...f] = line.split(/\s+/);
		const n = (i: number) => Number(f[i] ?? 0);
		switch (tag) {
			case "chr":
				chr = f;
				break;
			case "frm":
				cur = { n: f[0], s: n(2), p: n(3), cx: n(4), cy: n(5), d: n(6), nx: n(9), dvx: n(10), dvy: n(11), dvz: n(14) };
				frames[n(1)] = cur;
				break;
			case "bdy":
				if (cur) (cur.bdy ??= []).push([n(0), n(1), n(2), n(3)]);
				break;
			case "atk":
				if (cur) (cur.atk ??= []).push({ box: [n(0), n(1), n(2), n(3)], hp: n(5), fall: n(6), dizzy: n(7), dx: n(8), dy: n(9), dz: n(10), effect: n(11) });
				break;
			case "bla":
				// type x y z o mx my mz aid hp level mo facing …
				if (cur) (cur.bla ??= []).push({ type: n(0), x: n(1), y: n(2), z: n(3), mx: n(5), my: n(6), mz: n(7), aid: n(8), hp: n(9), facing: n(12) });
				break;
			case "eff":
				// type x y z o aid blasterID alpha …: type 1080 is a 摩摩星 part layer
				if (cur && n(0) === 1080 && n(6)) (cur.eff ??= []).push({ part: n(6), x: n(1), y: n(2), z: n(3), o: n(4), aid: n(5) });
				break;
			case "mpi":
				// 摩摩星 part info: stat mods, the backpack's reach, target and action type
				if (f[0]) mpi[f[0]] = f[1] ?? "";
				break;
			case "wpn":
				if (cur) cur.wpn = { type: n(0), x: n(1), y: n(2), z: n(3), o: n(4), dx: n(5), dy: n(6), dz: n(7), aid: n(8), facing: n(9) };
				break;
			case "snd":
				if (cur && f[0]) cur.snd = f[0].replace(/\\/g, "/").split("/").pop()!.toLowerCase();
				break;
			case "act":
				actions[f[0]] = n(3);
				actionFrame[n(1)] = n(3);
				// the row's 5th number is the action this one continues into once its frames run out
				if (n(4)) actNext.push([n(1), n(4)]);
				break;
			case "spm": {
				moves.push({
					keys: [...line.matchAll(/K\s+([A-Z]+)/g)].map((m) => m[1]),
					mp: Number(line.match(/\|M\s+(\d+)/)?.[1] ?? 0),
					from: Number(line.match(/\|F\s+(\d+)/)?.[1] ?? 0),
					to: Number(line.match(/\|T\s+(\d+)/)?.[1] ?? 0),
					slot: Number(line.match(/\|L\s+(\d+)/)?.[1] ?? -1),
				});
				break;
			}
		}
	}
	for (const m of moves) {
		m.to = actionFrame[m.to] ?? m.to;
		if (m.from) m.from = actionFrame[m.from] ?? m.from;
	}
	// The act table's next-action column. An action's frames end on nx = -1, which only says
	// "this chain is over": the client then enters the action named in that column
	// (SUPER2START → SUPER2LOOP_R: 散彈氣功波's wind-up goes on into the loop that fires it).
	// Only actions a special starts (the spm rows' target frames) are considered — the basic
	// actions have their own rules in the engine — and only where every act row ending there
	// agrees: an ambiguous frame keeps the plain reading. A continuation that loops on its own
	// (a sustained power-up or super) is left out, since the client holds it until something
	// else ends it and the remake has no such rule.
	const cont: Record<number, number> = {};
	{
		/** the last frame of the chain starting at `start`, or undefined when it never ends */
		const ends = (start: number) => {
			let id = start;
			let last = start;
			const seen = new Set<number>();
			while (id !== -1 && frames[id] && !seen.has(id)) {
				seen.add(id);
				last = id;
				id = frames[id].nx;
			}
			return id === -1 ? last : undefined;
		};
		const terminal = new Map<number, number>(); // special start frame -> its chain's last frame
		for (const m of moves) {
			if (m.from || !frames[m.to]) continue;
			const last = ends(m.to);
			if (last !== undefined) terminal.set(m.to, last);
		}
		const agreed = new Map<number, number | null>(); // last frame -> its continuation (null: rows disagree)
		for (const [aID, nextID] of actNext) {
			const start = actionFrame[aID];
			const next = actionFrame[nextID] ?? nextID;
			const last = terminal.get(start);
			if (last === undefined || next === start || next === last || !frames[next]) continue;
			if (ends(next) === undefined) continue;
			const was = agreed.get(last);
			agreed.set(last, was === undefined || was === next ? next : null);
		}
		// Drop any continuation that comes back round to where it started: a sustained move the
		// client repeats until something else interrupts it (kiki's SUPER6, a held power-up). The
		// remake has no rule for "until something else", so those keep the plain reading. Removing
		// one can expose another loop, so this runs until nothing changes.
		const cand = new Map<number, number>();
		for (const [last, next] of agreed) if (next !== null) cand.set(last, next);
		for (let changed = true; changed; ) {
			changed = false;
			for (const [last, next] of cand) {
				let id: number = next;
				const seen = new Set<number>([last]);
				let looped = false;
				for (let i = 0; i < 4000; i++) {
					if (id === -1) break;
					if (seen.has(id)) {
						looped = true;
						break;
					}
					seen.add(id);
					const f = frames[id];
					if (!f) break;
					id = f.nx !== -1 ? f.nx : (cand.get(id) ?? -1);
				}
				if (looped) {
					cand.delete(last);
					changed = true;
					break;
				}
			}
		}
		for (const [last, next] of cand) cont[last] = next;
	}
	// What each special can spawn: walk its frame chain (following nx and the act table's
	// continuation) and collect the `bla` types. The client fetches a move's art when it starts
	// rather than loading every effect a character owns up front — 星奇's are 787 MB decoded.
	for (const m of moves) {
		const fx = new Set<number>();
		const seen = new Set<number>();
		let id: number = m.to;
		for (let i = 0; i < 4000; i++) {
			if (id === -1 || seen.has(id)) break;
			seen.add(id);
			const f = frames[id];
			if (!f) break;
			for (const b of f.bla ?? []) if (b.type) fx.add(b.type);
			id = f.nx !== -1 ? f.nx : (cont[id] ?? -1);
		}
		if (fx.size) m.fx = [...fx];
	}
	const attrs = {
		id: Number(chr[1]),
		type: Number(chr[2]),
		hp: Number(chr[3]),
		mp: Number(chr[4]),
		walk: Number(chr[8]),
		run: Number(chr[9]),
		jumpH: Number(chr[10]),
		jumpD: Number(chr[11]),
		runJumpH: Number(chr[12]),
		runJumpD: Number(chr[13]),
		weight: Number(chr[16]),
	};
	return { attrs, nameEn: chr[0] ?? "", frames, actions, acts: actionFrame, cont, moves, pics, mpi };
}

/** Rewrites only the frame data of an exported sprite (atlas pages and rects stay as they are). */
export async function refreshFrames(json: string, spt: Spt) {
	const cur = await Bun.file(json).json();
	await Bun.write(json, JSON.stringify({ ...cur, attrs: spt.attrs, actions: spt.actions, acts: spt.acts, cont: spt.cont, moves: spt.moves, frames: spt.frames }));
}

/* ───────── atlas building (raw RGBA in memory) ───────── */

type Raw = { data: Buffer; w: number; h: number };
const sheetCache = new Map<string, Raw | null>();
async function sheet(name: string): Promise<Raw | null> {
	if (sheetCache.has(name)) return sheetCache.get(name)!;
	const bytes = await imageBytes(name);
	const raw = bytes
		? await sharp(bytes)
				.ensureAlpha()
				.raw()
				.toBuffer({ resolveWithObject: true })
				.then(({ data, info }) => ({ data, w: info.width, h: info.height }))
		: null;
	sheetCache.set(name, raw);
	return raw;
}
export const clearSheets = () => sheetCache.clear();

type Pic = { raw: Raw; ox: number; oy: number }; // trimmed image + its offset inside the frame canvas

async function buildPic(pieces: Piece[], prefix: string): Promise<Pic | null> {
	const { w, h } = pieces[0];
	const canvas = Buffer.alloc(w * h * 4);
	for (const pc of pieces) {
		const src = await sheet(`${prefix}${pc.sheet}.png`);
		if (!src) return null;
		const cw = Math.min(pc.x1 - pc.x0, src.w - pc.x0);
		const ch = Math.min(pc.y1 - pc.y0, src.h - pc.y0);
		for (let y = 0; y < ch; y++) {
			const ty = pc.dy + y;
			if (ty < 0 || ty >= h) continue;
			for (let x = 0; x < cw; x++) {
				const tx = pc.dx + x;
				if (tx < 0 || tx >= w) continue;
				const si = ((pc.y0 + y) * src.w + pc.x0 + x) * 4;
				if (src.data[si + 3] === 0) continue;
				src.data.copy(canvas, (ty * w + tx) * 4, si, si + 4);
			}
		}
	}
	let x0 = w, y0 = h, x1 = -1, y1 = -1;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++)
			if (canvas[(y * w + x) * 4 + 3]) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
	if (x1 < 0) return null;
	const tw = x1 - x0 + 1, th = y1 - y0 + 1;
	const out = Buffer.alloc(tw * th * 4);
	for (let y = 0; y < th; y++) canvas.copy(out, y * tw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + tw) * 4);
	return { raw: { data: out, w: tw, h: th }, ox: x0, oy: y0 };
}

/** Shelf packer: tallest first, GUTTER px apart, as many pages as needed. */
function pack(pics: [number, Pic][]) {
	type Item = { pid: number; pic: Pic; x: number; y: number };
	const sorted = [...pics].sort((a, b) => b[1].raw.h - a[1].raw.h);
	const pages: { items: Item[]; h: number }[] = [];
	let page = { items: [] as Item[], h: 0 };
	let x = 0, y = 0, rowH = 0;
	for (const [pid, pic] of sorted) {
		const { w, h } = pic.raw;
		if (x + w > PAGE) {
			x = 0;
			y += rowH + GUTTER;
			rowH = 0;
		}
		if (y + h > PAGE) {
			pages.push(page);
			page = { items: [], h: 0 };
			x = y = rowH = 0;
		}
		page.items.push({ pid, pic, x, y });
		x += w + GUTTER;
		rowH = Math.max(rowH, h);
		page.h = Math.max(page.h, y + h);
	}
	if (page.items.length) pages.push(page);
	return pages;
}

async function writePage(items: { pic: Pic; x: number; y: number }[], height: number, file: string) {
	const buf = Buffer.alloc(PAGE * height * 4);
	for (const { pic, x, y } of items)
		for (let r = 0; r < pic.raw.h; r++) pic.raw.data.copy(buf, ((y + r) * PAGE + x) * 4, r * pic.raw.w * 4, (r + 1) * pic.raw.w * 4);
	await sharp(buf, { raw: { width: PAGE, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file);
}

/* ───────── picture sources ───────── */

/** Resolves a frame's picture id to atlas pieces + the sheet prefix they live on. */
export type PicSource = (pid: number) => { pieces: Piece[]; prefix: string } | null;

let zpakIndex: Map<string, { pieces: Piece[]; prefix: string }> | null = null;
/** Every ZPAK atlas (npc, creature*, weapon, specialobj …) keyed by picture file name. */
export async function zpak() {
	if (zpakIndex) return zpakIndex;
	const pak = await unpackLfo("pak.lfo");
	zpakIndex = new Map();
	for (const f of new Bun.Glob("ZPAK/*/*.pak").scanSync(pak)) {
		const prefix = f.split("/").pop()!.replace(/\.pak$/i, "").toLowerCase();
		for (const [name, pieces] of await readPak(`${pak}/${f}`)) if (!zpakIndex.has(name)) zpakIndex.set(name, { pieces, prefix });
	}
	return zpakIndex;
}

/** Objects whose .spt lists plain image files (lobby shopkeepers, clouds …): one whole-image piece each. */
export async function imageSource(spt: Spt): Promise<PicSource> {
	const map = new Map<number, { pieces: Piece[]; prefix: string }>();
	for (const [pid, name] of spt.pics) {
		const file = name.split("/").pop()!;
		const bytes = await imageBytes(file);
		if (!bytes) continue;
		const { width = 0, height = 0 } = await sharp(bytes).metadata();
		// sheet() loads `${prefix}${sheet}.png`: the prefix is the file's own name
		const piece = { sheet: "" as unknown as number, w: width, h: height, x0: 0, y0: 0, x1: width, y1: height, dx: 0, dy: 0 };
		map.set(pid, { pieces: [piece], prefix: file.replace(/\.png$/i, "") });
	}
	return (pid) => map.get(pid) ?? null;
}

/** Player characters: pak/<NAME>/<name>.pak keyed by picture id. */
export async function pakByIdSource(pakPath: string): Promise<PicSource> {
	const map = await readPak(pakPath);
	const prefix = pakPath.split("/").pop()!.replace(/\.pak$/i, "").toLowerCase();
	return (pid) => {
		const pieces = map.get(String(pid));
		return pieces ? { pieces, prefix } : null;
	};
}

/** Everything else: the .spt pic list names a file inside some ZPAK atlas. */
export async function zpakSource(spt: Spt): Promise<PicSource> {
	const idx = await zpak();
	return (pid) => {
		const name = spt.pics.get(pid);
		return name ? (idx.get(name) ?? null) : null;
	};
}

/* ───────── export ───────── */

/** Writes <dir>/<key>.json + <key>-<n>.png atlas pages. Returns null when nothing renders. */
export async function exportSprite(opts: { dir: string; key: string; spt: Spt; source: PicSource; extra?: Record<string, unknown> }) {
	const { dir, key, spt, source } = opts;
	await mkdir(dir, { recursive: true });
	const used = new Set(Object.values(spt.frames).map((f) => f.p));
	const pics: [number, Pic][] = [];
	for (const pid of used) {
		const src = source(pid);
		if (!src) continue;
		const pic = await buildPic(src.pieces, src.prefix);
		if (pic) pics.push([pid, pic]);
	}
	clearSheets();
	if (!pics.length) return null;
	const pages = pack(pics);
	const rects: Record<number, [number, number, number, number, number, number, number]> = {};
	for (const [i, p] of pages.entries()) {
		await writePage(p.items, p.h, `${dir}/${key}-${i}.png`);
		for (const it of p.items) rects[it.pid] = [i, it.x, it.y, it.pic.raw.w, it.pic.raw.h, it.pic.ox, it.pic.oy];
	}
	const out = {
		key,
		nameEn: spt.nameEn,
		attrs: spt.attrs,
		actions: spt.actions,
		// action id -> start frame (a held weapon is driven by its holder's wpn.aid)
		acts: spt.acts,
		// a chain's last frame -> the action the client enters after it (the act table's next column)
		cont: spt.cont,
		moves: spt.moves,
		frames: spt.frames,
		pages: pages.map((_, i) => `${key}-${i}.png`),
		// changes with every export, so browsers never pair a cached old page with new rects
		version: Date.now().toString(36),
		rects,
		...opts.extra,
	};
	await Bun.write(`${dir}/${key}.json`, JSON.stringify(out));
	return { frames: Object.keys(spt.frames).length, pics: pics.length, pages: pages.length, sounds: Object.values(spt.frames).flatMap((f) => (f.snd ? [f.snd] : [])) };
}
