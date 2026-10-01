// Readers for the original LFO client data.
// Formats are documented inline; see also the LFE forum thread for archive passwords.
import zlib from "node:zlib";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

export const SRC = process.env.LFO_SRC ?? "/Volumes/Pie/Downloads/lfo-master";
export const CACHE = `${import.meta.dir}/../.cache`; // repo-root .cache, shared by all pipeline steps

// Per-archive ZipCrypto passwords, published at
// https://lf-empire.de/forum/archive/index.php?thread-11429.html
const PASSWORDS: Record<string, string> = {
	"pak.lfo": "e350M2321204{372J417y370l263/3907210q174=216l2632299`345+386v367",
	"loadsprite.lfo": "c348K230/202y370H415w368j261-3885208o172;214j2610297^343)384t365",
	"string.lfo": "~187f69J416209c2544207'100H227P47,11V53'100K136y182D2231204",
	"spe.lfo": "q362Y244=216)384V429'382x275;402C222}186I228x275>311l3577398$379",
	"spew.lfo": "G226/108q80]248,293[246N139o266w86S50}92N139r175B221k262X243",
	"spec.lfo": "3206y88]60I228v273G226:119[246c66?30i72:119^155.201W242D223",
	"talk.lfo": "4207z89^61J229w274H227;120\\247d67@31j73;120_156/202X243E224",
	"story.lfo": "k356S2387210#378P423!376r2695396=216w180C222r2698305f3511392|373",
	"script.lfo": "|185d67H394207a2522205%98F225N45*9T51%98I134w180B221/202",
	"map.lfo": "g352O2343206}374L419{372n26513929212s176?218n2654301b347-388x369",
	"bg.lfo": "P2358117z89f2575302d255W148x275\"95\\59(101W148{184K230t271a252",
	"spes.lfo": "C222+104m76Y244(289W242J135k262s82O46y88J135n171>217g258T239",
	"spen.lfo": ">217&99h71T239#284R237E130f257n77J41t83E130i1669212b253O234",
	"speb.lfo": "2205x87\\59H227u272F2259118Z245b65>29h719118]154-200V241C222",
	"loadstorylist.lfo": ")196o78S50?218l263=2160109Q236Y56520_620109T145$191M232:213",
};

/** Unzip an .lfo archive into the cache once; returns the extraction dir. */
export async function unpackLfo(archive: string, as = archive.replace(/\W/g, "_")) {
	const out = `${CACHE}/lfo/${as}`;
	if (await Bun.file(`${out}/.done`).exists()) return out;
	await mkdir(out, { recursive: true });
	const pw = PASSWORDS[archive.split("/").pop()!];
	const r = Bun.spawnSync(["unzip", "-oqq", "-P", pw, "-d", out, `${SRC}/${archive}`, "-x", "*.svn*"], { stdin: "ignore" });
	if (r.exitCode > 1) {
		// A few archives carry Big5 file names that macOS unzip cannot write (it then stops and
		// prompts). Fall back to extracting the ASCII-named entries in batches.
		const list = Bun.spawnSync(["unzip", "-Z1", `${SRC}/${archive}`]).stdout.toString().split("\n");
		const ascii = list.filter((n) => n && !n.endsWith("/") && /^[\x20-\x7e]+$/.test(n) && !/[?*[]/.test(n) && !n.includes(".svn"));
		for (let i = 0; i < ascii.length; i += 200) {
			const b = Bun.spawnSync(["unzip", "-oqq", "-P", pw, "-d", out, `${SRC}/${archive}`, ...ascii.slice(i, i + 200)], { stdin: "ignore" });
			if (b.exitCode > 1) throw new Error(`unzip ${archive}: ${b.stderr.toString().slice(0, 300)}`);
		}
	}
	await Bun.write(`${out}/.done`, "");
	return out;
}

/* ───────── .tzw image packs ─────────
 * u32 indexCompLen, u32 indexLen, zlib(index), then blobs back to back.
 * index: u32 count, then count × { char name[50] (NUL-terminated), u32 size }. */

type Loc = [pack: string, offset: number, size: number];
let imageIndex: Record<string, Loc> | null = null;

export async function images() {
	if (imageIndex) return imageIndex;
	const cached = Bun.file(`${CACHE}/image-index.json`);
	if (await cached.exists()) return (imageIndex = await cached.json());
	const index: Record<string, Loc> = {};
	// later packs override earlier ones (they carry updated art)
	const packs = [...new Bun.Glob("*.tzw").scanSync(SRC)].sort(
		(a, b) => (Number(a.match(/\d+/)?.[0]) || -1) - (Number(b.match(/\d+/)?.[0]) || -1),
	);
	for (const pack of packs) {
		const b = new Uint8Array(await Bun.file(`${SRC}/${pack}`).arrayBuffer());
		const dv = new DataView(b.buffer);
		let idx: Uint8Array;
		try {
			idx = zlib.inflateSync(b.subarray(8, 8 + dv.getUint32(0, true)));
		} catch {
			continue; // not an image pack
		}
		const iv = new DataView(idx.buffer, idx.byteOffset, idx.byteLength);
		let p = 8 + dv.getUint32(0, true);
		for (let i = 0, n = iv.getUint32(0, true); i < n; i++) {
			const o = 4 + i * 54;
			const raw = idx.subarray(o, o + 50);
			const end = raw.indexOf(0);
			const name = new TextDecoder("latin1").decode(end === -1 ? raw : raw.subarray(0, end)).toLowerCase();
			const size = iv.getUint32(o + 50, true);
			if (size) index[name] = [pack, p, size];
			p += size;
		}
	}
	await mkdir(CACHE, { recursive: true });
	await Bun.write(cached, JSON.stringify(index));
	return (imageIndex = index);
}

export async function imageBytes(name: string) {
	const loc = (await images())[name.toLowerCase()];
	if (!loc) return null;
	const [pack, off, size] = loc;
	return new Uint8Array(await Bun.file(`${SRC}/${pack}`).slice(off, off + size).arrayBuffer());
}

/* ───────── .pak atlas definitions ─────────
 * line 1: sheet count, line 2: entry count, then per piece:
 *   name sheet canvasW canvasH x0 y0 x1 y1 dx dy
 * a logical image may be composed of several pieces (same name, several lines). */

export type Piece = { sheet: number; w: number; h: number; x0: number; y0: number; x1: number; y1: number; dx: number; dy: number };

export async function readPak(path: string) {
	const lines = (await Bun.file(path).text()).split(/\r?\n/).slice(2);
	const map = new Map<string, Piece[]>();
	for (const line of lines) {
		const p = line.trim().split(/\s+/);
		if (p.length < 10) continue;
		const [name, ...nums] = p;
		const [sheet, w, h, x0, y0, x1, y1, dx, dy] = nums.map(Number);
		const key = name.toLowerCase().replace(/\\/g, "/");
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push({ sheet, w, h, x0, y0, x1, y1, dx, dy });
	}
	return map;
}

/** Composite a logical image out of its atlas pieces; sheets are `${prefix}${sheet}.png`. */
export async function composite(pieces: Piece[], prefix: string, opts: { trim?: boolean } = {}) {
	const { w, h } = pieces[0];
	const layers = [];
	for (const pc of pieces) {
		const src = await imageBytes(`${prefix}${pc.sheet}.png`);
		if (!src) throw new Error(`missing sheet ${prefix}${pc.sheet}.png`);
		const cw = pc.x1 - pc.x0, ch = pc.y1 - pc.y0;
		if (cw <= 0 || ch <= 0) continue;
		const input = await sharp(src).extract({ left: pc.x0, top: pc.y0, width: cw, height: ch }).png().toBuffer();
		layers.push({ input, left: pc.dx, top: pc.dy });
	}
	let img = sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers);
	if (opts.trim) img = sharp(await img.png().toBuffer()).trim({ threshold: 1 });
	return img.png().toBuffer();
}

/* ───────── string tables ─────────
 * UTF-16LE text: "<---- START ----> id" newline text newline "<----- END ----->" */

export async function readStrings(path: string) {
	const text = new TextDecoder("utf-16le").decode(await Bun.file(path).arrayBuffer());
	const map = new Map<number, string>();
	for (const m of text.matchAll(/<-+\s*START\s*-+>\s*(\d+)[^\n]*\n([\s\S]*?)<-+\s*END\s*-+>/g))
		map.set(Number(m[1]), m[2].replace(/\r/g, "").trim());
	return map;
}

/* ───────── .spt sprite/character definitions ─────────
 * LF2-style text: tagged rows (chr, att, eqn, eqr, eqm, eqd, spm …), a pic list, then frames.
 * We only need the header rows here. */

export type Spt = { rows: Map<string, string[][]>; pics: Map<number, string> };

export async function readSpt(path: string): Promise<Spt> {
	const text = (await Bun.file(path).text()).replace(/\r/g, "");
	const head = text.split("//--------Frame Data")[0];
	const rows = new Map<string, string[][]>();
	const pics = new Map<number, string>();
	let inPic = false;
	for (const raw of head.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("//")) continue;
		if (line === "pic") {
			inPic = true;
			continue;
		}
		if (inPic) {
			const m = line.match(/^(-?\d+)\s+(\S+)/);
			if (m) pics.set(Number(m[1]), m[2].replace(/\\/g, "/").toLowerCase());
			else inPic = false;
			continue;
		}
		const [tag, ...rest] = line.split(/\s+/);
		if (!rows.has(tag)) rows.set(tag, []);
		rows.get(tag)!.push(rest);
	}
	return { rows, pics };
}

/* ───────── skill.tzw.bin ─────────
 * u32 count, then count × { u32 compLen, zlib(200-byte record) }.
 * record: i32 charId, slot, nameId, tier, ?, mp, ?, ?, … ; char path[] at 44. */

export type SkillRec = { charId: number; slot: number; nameId: number; tier: number; mp: number; anim: string; raw: number[] };

export async function readSkills(): Promise<SkillRec[]> {
	const b = new Uint8Array(await Bun.file(`${SRC}/skill.tzw.bin`).arrayBuffer());
	const dv = new DataView(b.buffer);
	const out: SkillRec[] = [];
	let p = 4;
	while (p < b.length) {
		const c = dv.getUint32(p, true);
		const r = zlib.inflateSync(b.subarray(p + 4, p + 4 + c));
		p += 4 + c;
		const v = new DataView(r.buffer, r.byteOffset, r.byteLength);
		const raw = Array.from({ length: 11 }, (_, i) => v.getInt32(i * 4, true));
		const anim = new TextDecoder("latin1").decode(r.subarray(44, 108)).split("\0")[0];
		out.push({ charId: raw[0], slot: raw[1], nameId: raw[2], tier: raw[3], mp: raw[5], anim, raw });
	}
	return out;
}
