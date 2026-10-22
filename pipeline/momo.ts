// 摩摩星朋友 (legacy/content/docs/system/momo.mdx): the follower and its paper-doll parts.
//   data/assets/game/sprites/3500.json      the base creature (creature/momostar.spt): frames that
//                                           draw no picture of their own, only part layers (eff
//                                           1080 rows: slot 10000 body, 20000 head, 30000 face,
//                                           40000 backpack, 50000 skin, at an offset per frame)
//   data/assets/game/sprites/<id>.json/.png every part (weapon/momostar_*.spt), with its mpi info
//   data/assets/game/momo.json              the parts by slot; a backpack's attack action
// Usage: bun momo.ts
import { unpackLfo } from "./lfo";
import { exportSprite, parseSpt, zpakSource } from "./sprite-lib";

const OUT = `${import.meta.dir}/../data/assets/game`;
const BASE_ID = 3500;
const SLOTS: Record<number, string> = { 10000: "body", 20000: "head", 30000: "face", 40000: "backpack", 50000: "skin" };

const [spec, spew] = await Promise.all([unpackLfo("spec.lfo"), unpackLfo("spew.lfo")]);
const find = (dir: string, test: (name: string) => boolean) =>
	[...new Bun.Glob("**/*.spt").scanSync(dir)].filter((f) => !/(^|\/)_tw\//i.test(f) && test(f.split("/").pop()!.toLowerCase())).sort();

/* ───────── the base creature ───────── */

const [basePath] = find(spec, (n) => n === "momostar.spt");
if (!basePath) throw new Error("creature/momostar.spt not found");
const base = parseSpt(await Bun.file(`${spec}/${basePath}`).text());
// its attacks (boxing_lv1 … G_004 … Davis_01) are frame names, not act rows: name each one's first frame
for (const [id, f] of Object.entries(base.frames).sort(([a], [b]) => Number(a) - Number(b)))
	if (base.actions[f.n] === undefined) base.actions[f.n] = Number(id);
await Bun.write(
	`${OUT}/sprites/${BASE_ID}.json`,
	JSON.stringify({
		key: String(BASE_ID),
		nameEn: base.nameEn,
		attrs: base.attrs,
		actions: base.actions,
		acts: base.acts,
		moves: base.moves,
		frames: base.frames,
		// drawn from its parts only
		pages: [],
		rects: {},
		version: Date.now().toString(36),
		id: BASE_ID,
	}),
);
const layered = Object.values(base.frames).filter((f) => f.eff?.length).length;
console.log(`momo: base ${BASE_ID}, ${Object.keys(base.frames).length} frames (${layered} layered), ${Object.keys(base.actions).length} actions`);

/* ───────── the parts ───────── */

type Part = { id: number; slot: string; name: string; mpi: Record<string, string>; attack?: string };
const parts: Part[] = [];
for (const rel of find(spew, (n) => n.startsWith("momostar_"))) {
	const spt = parseSpt(await Bun.file(`${spew}/${rel}`).text());
	const id = spt.attrs.id;
	const slot = SLOTS[Math.floor(id / 10000) * 10000];
	if (!slot) continue;
	const r = await exportSprite({ dir: `${OUT}/sprites`, key: String(id), spt, source: await zpakSource(spt), extra: { id, mpi: spt.mpi } });
	if (!r) continue;
	const part: Part = { id, slot, name: rel.split("/").pop()!.replace(/\.spt$/i, ""), mpi: spt.mpi };
	// a backpack's own art is named after the base creature's attack it fires (G004_Stand → G_004)
	if (slot === "backpack") {
		const g = [...spt.pics.values()].join(" ").match(/g(\d{3})_/i);
		const act = g ? `G_${g[1]}` : null;
		if (act && base.actions[act] !== undefined) part.attack = act;
	}
	parts.push(part);
}
parts.sort((a, b) => a.id - b.id);
await Bun.write(`${OUT}/momo.json`, JSON.stringify({ base: BASE_ID, parts }));
const by = (s: string) => parts.filter((p) => p.slot === s).length;
console.log(`momo: ${parts.length} parts — body ${by("body")}, head ${by("head")}, face ${by("face")}, skin ${by("skin")}, backpack ${by("backpack")} (${parts.filter((p) => p.attack).length} with their own attack)`);

/* ───────── what the base creature spawns ───────── */

const spawns = new Set<number>();
for (const f of Object.values(base.frames)) for (const b of f.bla ?? []) if (b.type) spawns.add(b.type);
const missing = [...spawns].filter((t) => !Bun.file(`${OUT}/sprites/${t}.json`).size);
if (missing.length) console.warn(`momo: spawned objects not exported (run stories.ts --effects): ${missing.join(" ")}`);
