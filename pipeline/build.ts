// Builds data/lfo.db and data/assets/dex/** from the original LFO client.
// Usage: LFO_SRC=/path/to/lfo-master bun pipeline/build.ts
import { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import sharp from "sharp";
import { composite, imageBytes, type Piece, readPak, readSkills, readSpt, readStrings, unpackLfo } from "./lfo";

const ROOT = `${import.meta.dir}/..`;
const ASSETS = `${ROOT}/data/assets`;
const DB_PATH = `${ROOT}/data/lfo.db`;
const SCHEMA = `${ROOT}/api/internal/db/schema.sql`;

const t0 = performance.now();
const log = (...a: unknown[]) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const [pak, spe, spew, str] = await Promise.all([
	unpackLfo("pak.lfo"),
	unpackLfo("spe.lfo"),
	unpackLfo("spew.lfo"),
	unpackLfo("hk/string.lfo", "string_hk"),
]);
const MISC = `${str}/STORY/MISC`;
const [charNames, itemNames, skillNames] = await Promise.all([
	readStrings(`${MISC}/name.tzw`),
	readStrings(`${MISC}/itemname.tzw`),
	readStrings(`${MISC}/skillname.tzw`),
]);
const [iface, faces, weapons] = await Promise.all([
	readPak(`${pak}/ZPAK/INTERFACE/interface.pak`),
	readPak(`${pak}/ZPAK/FACE/face.pak`),
	readPak(`${pak}/ZPAK/WEAPON/weapon.pak`),
]);
log("sources ready");

await rm(`${ASSETS}/dex`, { recursive: true, force: true });
for (const d of ["logo", "chars", "faces", "skills", "items", "scene"]) await mkdir(`${ASSETS}/dex/${d}`, { recursive: true });

type Rendered = { path: string; color: string | null };

/**
 * The art's signature colour, as #rrggbb: the average of the most populated hue bucket
 * among opaque, reasonably saturated pixels. (sharp's stats().dominant counts transparent
 * and outline pixels, which makes every sprite come out near-white.)
 */
async function dominant(png: Buffer) {
	const { data } = await sharp(png).resize(48, 48, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
	for (let i = 0; i < data.length; i += 4) {
		const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
		if (a < 160) continue;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const sat = max === 0 ? 0 : (max - min) / max;
		if (sat < 0.28 || max < 60 || min > 225) continue; // outlines, shadows, highlights
		let h = 0;
		if (max === r) h = ((g - b) / (max - min)) % 6;
		else if (max === g) h = (b - r) / (max - min) + 2;
		else h = (r - g) / (max - min) + 4;
		const deg = (h * 60 + 360) % 360;
		// skin tones would otherwise win on every character portrait
		if (deg >= 12 && deg <= 45 && sat < 0.62 && max > 140) continue;
		const key = Math.floor((deg / 360) * 18); // 20° buckets
		const w = sat * sat; // vivid pixels (hair, costume) count more than muted ones
		const acc = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
		acc.n += w;
		acc.r += r * w;
		acc.g += g * w;
		acc.b += b * w;
		buckets.set(key, acc);
	}
	const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
	if (!best || best.n < 4) return null;
	return `#${[best.r, best.g, best.b].map((v) => Math.round(v / best.n).toString(16).padStart(2, "0")).join("")}`;
}

async function render(pieces: Piece[] | undefined, prefix: string, out: string, trim = false): Promise<Rendered | null> {
	if (!pieces) return null;
	try {
		const png = await composite(pieces, prefix, { trim });
		await Bun.write(`${ASSETS}/dex/${out}`, png);
		return { path: `dex/${out}`, color: await dominant(png) };
	} catch (e) {
		console.warn(`  skip ${out}: ${(e as Error).message}`);
		return null;
	}
}

/* ───────── logos ───────── */
await render(iface.get("intro/3dlogo.png"), "interface", "logo/lfo-hk.png");
await render(iface.get("intro/3dlogo2.png"), "interface", "logo/lfo-tw.png");

// The opening cinematic's panorama (sky -> sea -> cliff -> forest): four rows of a
// 511 + 289 px tile pair, each tile carrying one transparent edge row/column.
{
	const layers = [];
	for (let row = 0; row < 4; row++) {
		for (const [col, sheet] of [
			[0, 20 + row * 2],
			[1, 21 + row * 2],
		]) {
			const buf = await imageBytes(`interface${sheet}.png`);
			if (!buf) continue;
			const w = col === 0 ? 511 : 289;
			layers.push({ input: await sharp(buf).extract({ left: 0, top: 0, width: w, height: 511 }).toBuffer(), left: col * 511, top: row * 511 });
		}
	}
	await mkdir(`${ASSETS}/dex/scene`, { recursive: true });
	await sharp({ create: { width: 800, height: 511 * 4, channels: 3, background: "#000" } })
		.composite(layers)
		.jpeg({ quality: 86, mozjpeg: true })
		.toFile(`${ASSETS}/dex/scene/prologue.jpg`);
}
log("logos + scene");

/* ───────── database ───────── */
await mkdir(`${ROOT}/data`, { recursive: true });
await rm(DB_PATH, { force: true });
const db = new Database(DB_PATH, { create: true, strict: true });
db.exec(await Bun.file(SCHEMA).text());

const STATS = ["hp", "mp", "sp", "str", "def", "agi"] as const;
const statObj = (vals: (string | number)[] = []) => Object.fromEntries(STATS.map((k, i) => [k, Number(vals[i] ?? 0)]));

/* ───────── characters ───────── */
const insChar = db.prepare(`INSERT OR REPLACE INTO characters VALUES
	($id,$key,$name,$name_en,$base_id,$hp,$mp,$dp,$ap,$st,$walk,$run,$jump_h,$jump_d,$weight,$sd,$sg,$sm,$ws,$portrait,$head,$faces,$color)`);
const insSearch = db.prepare("INSERT INTO search (name, description, kind, ref) VALUES (?,?,?,?)");
const spmBySlot = new Map<string, { keys: string[]; chain: boolean }>(); // `${charId}:${slot}` -> inputs

let nChars = 0;
for (const f of [...new Bun.Glob("**/*.spt").scanSync(spe)].sort()) {
	const spt = await readSpt(`${spe}/${f}`);
	const chr = spt.rows.get("chr")?.[0];
	if (!chr) continue;
	const id = Number(chr[1]);
	const name = charNames.get(id);
	if (!name || name === "-") continue;
	const key = f.split("/").pop()!.replace(/\.spt$/i, "").toLowerCase();
	const base = key.replace(/_?r$/, "").replace(/p$/, "") || key;
	const artKey =
		[key, base, key.replace(/_r$/, "")].find((k) => iface.has(`profile/${k}_big.png`) || iface.has(`profile/${k}_head.png`)) ?? key;

	for (const row of spt.rows.get("spm") ?? []) {
		const line = row.join(" ");
		const slot = line.match(/\|L\s+(\d+)/)?.[1];
		const keys = [...line.matchAll(/K\s+([A-Z]+)/g)].map((m) => m[1]);
		const from = Number(line.match(/\|F\s+(\d+)/)?.[1] ?? 0);
		if (slot && keys.length) spmBySlot.set(`${id}:${slot}`, { keys, chain: from !== 0 });
	}

	const faceImgs: string[] = [];
	if (id < 7000) {
		const faceKeys = [...faces.keys()].filter((k) => k.startsWith(`pic/${artKey.replace(/_r$/, "")}_`)).sort().slice(0, 12);
		for (const fk of faceKeys) {
			const r = await render(faces.get(fk), "face", `faces/${fk.slice(4)}`, true);
			if (r) faceImgs.push(r.path);
		}
	}
	const portrait = await render(iface.get(`profile/${artKey}_big.png`), "interface", `chars/${key}_big.png`, true);
	const head = await render(iface.get(`profile/${artKey}_head.png`), "interface", `chars/${key}_head.png`, true);
	const att = spt.rows.get("att")?.[0] ?? [];
	const wea = spt.rows.get("wea")?.[0] ?? [];
	insChar.run({
		id,
		key,
		name,
		name_en: chr[0],
		base_id: id >= 7000 && id < 8000 ? id - 7000 : null,
		hp: +chr[3], mp: +chr[4], dp: +chr[5], ap: +chr[6], st: +chr[7],
		walk: +chr[8], run: +chr[9], jump_h: +chr[10], jump_d: +chr[11], weight: +chr[16],
		sd: JSON.stringify(statObj(att.slice(0, 6))),
		sg: JSON.stringify(statObj(att.slice(11, 17))),
		sm: JSON.stringify(statObj(att.slice(22, 28))),
		ws: JSON.stringify(Object.fromEntries(["sword", "spear", "throw", "heavy", "bow", "whip", "wand"].map((k, i) => [k, Number(wea[i] ?? 0)]))),
		portrait: portrait?.path ?? null,
		head: head?.path ?? null,
		faces: JSON.stringify(faceImgs),
		color: portrait?.color ?? head?.color ?? null,
	});
	insSearch.run(name, chr[0], "character", String(id));
	nChars++;
}
log("characters", nChars);

/* ───────── skills ───────── */
const insSkill = db.prepare(`INSERT INTO skills (char_id,slot,name,tier,mp,keys,chain,ultimate,icon)
	VALUES ($char_id,$slot,$name,$tier,$mp,$keys,$chain,$ultimate,$icon)`);
const known = new Set(db.query("SELECT id FROM characters").values().map((r) => Number(r[0])));
let nSkills = 0;
for (const r of await readSkills()) {
	if (!known.has(r.charId)) continue;
	const name = skillNames.get(r.nameId);
	if (!name) continue;
	const icon = await render(iface.get(`${r.anim.toLowerCase()}_bright.png`), "interface", `skills/${r.anim.split("/").pop()}.png`);
	const spm = spmBySlot.get(`${r.charId}:${r.slot}`);
	const { lastInsertRowid } = insSkill.run({
		char_id: r.charId,
		slot: r.slot,
		name,
		tier: r.tier,
		mp: r.mp,
		keys: JSON.stringify(spm?.keys ?? []),
		chain: spm?.chain ? 1 : 0,
		ultimate: r.raw[7] === 0 ? 1 : 0,
		icon: icon?.path ?? null,
	});
	insSearch.run(name, "", "skill", String(lastInsertRowid));
	nSkills++;
}
log("skills", nSkills);

/* ───────── items + equipment ───────── */
const EQUIP_PART: Record<number, string> = { 0: "飾品", 1: "頭盔", 4: "衣甲", 5: "盾牌", 6: "手部", 7: "鞋子", 8: "戒指" };
const ITEM_TYPE: Record<number, string> = {
	100: "武器", 300: "長兵器", 400: "投擲物", 900: "弓", 1000: "箭", 200: "重物",
	500: "藥品食物", 2000: "草藥", 2900: "材料", 3200: "魔精石", 5800: "念源體",
};
function classify(part: number, type: number, id: number) {
	if (type === 5600) return { kind: "equipment", category: id >= 40000 ? "背包" : "時裝" };
	if (part in EQUIP_PART) return { kind: "equipment", category: EQUIP_PART[part] };
	return { kind: "item", category: ITEM_TYPE[type] ?? "其他" };
}

const insItem = db.prepare(`INSERT OR REPLACE INTO items VALUES
	($id,$key,$name,$description,$kind,$category,$part,$type,$req_lv,$req,$mods,$mod_total,$durability,$material,$price,$users,$icon,$color)`);
const seen = new Set<string>();
let nItems = 0;
for (const f of [...new Bun.Glob("weapon/*.spt").scanSync(spew)].sort()) {
	const spt = await readSpt(`${spew}/${f}`);
	const chr = spt.rows.get("chr")?.[0];
	const eqn = spt.rows.get("eqn")?.[0];
	if (!chr || !eqn) continue;
	const id = Number(chr[1]);
	const type = Number(chr[2]);
	const part = Number(eqn[0]);
	const name = itemNames.get(Number(eqn[1]));
	if (!name) continue;
	const rawDesc = itemNames.get(Number(eqn[2]));
	const eqr = spt.rows.get("eqr")?.[0] ?? [];
	const mods = statObj(spt.rows.get("eqm")?.[0]);
	const eqd = spt.rows.get("eqd")?.[0] ?? [];
	const pic = spt.pics.get(0);
	const { kind, category } = classify(part, type, id);

	// several .spt files describe the same visible item (e.g. map pickups); keep one
	const dedupe = `${name}|${category}|${JSON.stringify(mods)}|${pic}`;
	if (seen.has(dedupe)) continue;
	seen.add(dedupe);

	const icon = pic ? await render(weapons.get(pic), "weapon", `items/${id}.png`, true) : null;
	const description = rawDesc && rawDesc !== "--" ? rawDesc : null;
	insItem.run({
		id,
		key: f.split("/").pop()!.replace(/\.spt$/i, ""),
		name,
		description,
		kind,
		category,
		part,
		type,
		req_lv: Number(eqr[0] ?? 0),
		req: JSON.stringify(statObj(eqr.slice(1))),
		mods: JSON.stringify(mods),
		mod_total: Object.values(mods).reduce((a, b) => a + b, 0),
		durability: Number(eqd[0] ?? 0),
		material: Number(eqd[1] ?? 0),
		price: Number(eqd[2] ?? 0),
		users: JSON.stringify((spt.rows.get("equ")?.[0] ?? []).map(Number).filter((u) => u >= 0)),
		icon: icon?.path ?? null,
		color: icon?.color ?? null,
	});
	insSearch.run(name, description ?? "", kind, String(id));
	nItems++;
}
log("items", nItems);

db.exec("PRAGMA optimize; VACUUM;");
console.table(db.query("SELECT kind, count(*) n, sum(icon IS NOT NULL) icons FROM items GROUP BY 1").all());
console.table(db.query("SELECT count(*) chars, sum(portrait IS NOT NULL) portrait, sum(color IS NOT NULL) color FROM characters").all());
console.table(db.query("SELECT count(*) skills, sum(icon IS NOT NULL) icons, sum(keys != '[]') with_keys FROM skills").all());
db.close();
log("done →", DB_PATH);
