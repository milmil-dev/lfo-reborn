// Exports playable character data for the web game client:
//   data/assets/game/chars/<key>.json  frames, actions, moves, attributes, atlas rects
//   data/assets/game/chars/<key>-<n>.png  packed sprite atlas pages
//   data/assets/game/sfx/*.wav  sounds referenced by frames
// Usage: bun sprites.ts [key ...]   (default: every character with a .pak and a name)
import { copyFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { imageBytes, readStrings, SRC, unpackLfo } from "./lfo";
import { exportSprite, pakByIdSource, parseSpt, refreshFrames } from "./sprite-lib";

const ROOT = `${import.meta.dir}/..`;
const OUT = `${ROOT}/data/assets/game`;

const [pak, spe, str] = await Promise.all([unpackLfo("pak.lfo"), unpackLfo("spe.lfo"), unpackLfo("hk/string.lfo", "string_hk")]);
const names = await readStrings(`${str}/STORY/MISC/name.tzw`);
await mkdir(`${OUT}/chars`, { recursive: true });
await mkdir(`${OUT}/sfx`, { recursive: true });

/* ───────── per character ───────── */

const sfxNeeded = new Set<string>();

async function exportCharacter(key: string, sptPath: string, pakPath: string) {
	const spt = parseSpt(await Bun.file(sptPath).text());
	const name = names.get(spt.attrs.id);
	if (!name || name === "-") return null;
	const r = await exportSprite({ dir: `${OUT}/chars`, key, spt, source: await pakByIdSource(pakPath), extra: { name } });
	if (!r) return null;
	for (const s of r.sounds) sfxNeeded.add(s);
	return { key, id: spt.attrs.id, name, ...r };
}

// --frames: only re-read the .spt frame data into the existing JSON (atlases untouched, so the
// HD upscales stay valid)
const framesOnly = process.argv.includes("--frames");
const only = new Set(
	process.argv
		.slice(2)
		.filter((a) => !a.startsWith("--"))
		.map((s) => s.toLowerCase()),
);
const pakFiles = new Map<string, string>();
for (const f of new Bun.Glob("*/*.pak").scanSync(pak)) pakFiles.set(f.split("/").pop()!.replace(/\.pak$/i, "").toLowerCase(), `${pak}/${f}`);

const index: { key: string; id: number; name: string }[] = [];
const t0 = performance.now();
for (const f of [...new Bun.Glob("**/*.spt").scanSync(spe)].sort()) {
	const key = f.split("/").pop()!.replace(/\.spt$/i, "").toLowerCase();
	if (only.size && !only.has(key)) continue;
	const pakPath = pakFiles.get(key);
	if (!pakPath) continue;
	if (framesOnly) {
		const json = `${OUT}/chars/${key}.json`;
		if (await Bun.file(json).exists()) await refreshFrames(json, parseSpt(await Bun.file(`${spe}/${f}`).text()));
		continue;
	}
	const r = await exportCharacter(key, `${spe}/${f}`, pakPath);
	if (!r) continue;
	index.push({ key: r.key, id: r.id, name: r.name });
	console.log(`${r.key.padEnd(14)} ${r.name}\tframes ${r.frames}\tpics ${r.pics}\tpages ${r.pages}\t${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

for (const s of sfxNeeded) {
	const src = `${SRC}/SFX/${s}`;
	const match = [...new Bun.Glob("*").scanSync(`${SRC}/SFX`)].find((n) => n.toLowerCase() === s);
	if (match) await copyFile(`${SRC}/SFX/${match}`, `${OUT}/sfx/${s}`);
	else if (!(await Bun.file(src).exists())) console.warn("  missing sfx", s);
}
if (framesOnly) {
	console.log("frames refreshed");
	process.exit(0);
}
if (!only.size && !framesOnly) await Bun.write(`${OUT}/chars/index.json`, JSON.stringify(index));
console.log(`characters ${index.length}, sfx ${sfxNeeded.size}`);

/* ───────── stages + audio for the client's menus and training ground ───────── */
await mkdir(`${OUT}/stages`, { recursive: true });
await mkdir(`${OUT}/bgm`, { recursive: true });
const STAGES: Record<string, string[]> = {
	// layer images back to front; the first sets the stage size
	gate: ["school2_base.png", "school2_rob.png"],
	plaza: ["school1b.png"],
};
for (const [name, layers] of Object.entries(STAGES)) {
	const base = await imageBytes(layers[0]);
	if (!base) continue;
	const meta = await sharp(base).metadata();
	const extra = [];
	for (const l of layers.slice(1)) {
		const b = await imageBytes(l);
		if (b) extra.push({ input: b, left: 420, top: 470 });
	}
	await sharp(base).composite(extra).webp({ quality: 88 }).toFile(`${OUT}/stages/${name}.webp`);
	await Bun.write(`${OUT}/stages/${name}.json`, JSON.stringify({ width: meta.width, height: meta.height }));
}
for (const f of ["lfo_character.ogg", "lfo_school1.ogg", "lfo_stadium1.ogg", "lfo_theme.ogg"]) await copyFile(`${SRC}/BGM/${f}`, `${OUT}/bgm/${f}`);
for (const f of ["pick.wav", "johnnychoose.wav", "johnnymove.wav", "johnnyconfirm.wav", "johnnyletsfight.wav", "hit1.wav", "hit2.wav", "hit3.wav", "guard.wav", "fall.wav", "jump.wav", "touchGround.wav"]) {
	const match = [...new Bun.Glob("*").scanSync(`${SRC}/SFX`)].find((n) => n.toLowerCase() === f.toLowerCase());
	if (match) await copyFile(`${SRC}/SFX/${match}`, `${OUT}/sfx/${f.toLowerCase()}`);
}
console.log("stages + audio");
