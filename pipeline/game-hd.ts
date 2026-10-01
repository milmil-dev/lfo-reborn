// HD versions of the game world: character / object atlases (chars/, sprites/), story room
// layers (bg/), training stages (stages/) and dialogue portraits (faces/) upscaled 2× with Real-ESRGAN, written next to each
// original as <name>@2x.webp, listed in data/assets/game/hd.json.
//
// 2× (not 4× like the UI) keeps GPU memory sane — a 2048² atlas page becomes 4096² — and covers
// the 1.5–2.4× the 800 × 600 world is scaled by on screen. PixiJS reads the @2x suffix as
// resolution 2, so frame rects in the sprite JSON stay in original pixels.
// Atlases are packed with a 6 px gutter (sprite-lib.ts) so upscaling never bleeds frames together.
//
// Needs realesrgan-ncnn-vulkan (see ui-hd.ts). Incremental: skips files whose @2x is newer.
import { mkdir, rm, stat } from "node:fs/promises";
import sharp from "sharp";

const ROOT = `${import.meta.dir}/..`;
const GAME = `${ROOT}/data/assets/game`;
const TMP = `${ROOT}/.cache/game-hd`;
const BIN = process.env.REALESRGAN ?? `${ROOT}/.cache/tools/realesrgan/realesrgan-ncnn-vulkan`;
const MODEL = "realesr-animevideov3-x2";

if (!(await Bun.file(BIN).exists())) {
	console.error(`realesrgan-ncnn-vulkan not found at ${BIN}; see ui-hd.ts`);
	process.exit(1);
}

const hdName = (f: string) => f.replace(/\.(png|webp)$/, "@2x.webp");
const only = process.argv.slice(2);
const files = [
	...new Bun.Glob("chars/*.png").scanSync(GAME),
	...new Bun.Glob("sprites/*.png").scanSync(GAME),
	...new Bun.Glob("bg/*.webp").scanSync(GAME),
	...new Bun.Glob("stages/*.webp").scanSync(GAME),
	...new Bun.Glob("faces/*.png").scanSync(GAME),
]
	.filter((f) => !f.includes("@2x"))
	.filter((f) => !only.length || only.some((o) => f.includes(o)))
	.sort();

async function fresh(f: string) {
	try {
		return (await stat(`${GAME}/${hdName(f)}`)).mtimeMs >= (await stat(`${GAME}/${f}`)).mtimeMs;
	} catch {
		return false;
	}
}

/** Bleed edge colours a couple of pixels into transparency so the model draws no dark halos. */
function bleed(data: Buffer, w: number, h: number, passes = 2) {
	const solid = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] > 8 ? 1 : 0;
	for (let pass = 0; pass < passes; pass++) {
		const next = solid.slice();
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				if (solid[i]) continue;
				let r = 0, g = 0, b = 0, n = 0;
				for (const j of [i - 1, i + 1, i - w, i + w]) {
					if (j < 0 || j >= w * h || !solid[j]) continue;
					r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
				}
				if (!n) continue;
				data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
				next[i] = 1;
			}
		solid.set(next);
	}
}

const todo: string[] = [];
for (const f of files) if (!(await fresh(f))) todo.push(f);
console.log(`game-hd: ${files.length} files, ${todo.length} to upscale`);

const flat = (f: string) => f.replaceAll("/", "__").replace(/\.(png|webp)$/, ".png");
const t0 = performance.now();
// in batches, so a long run shows progress and a crash loses little
for (let i = 0; i < todo.length; i += 24) {
	const batch = todo.slice(i, i + 24);
	await rm(TMP, { recursive: true, force: true });
	await mkdir(`${TMP}/in`, { recursive: true });
	await mkdir(`${TMP}/out`, { recursive: true });
	for (const f of batch) {
		const { data, info } = await sharp(`${GAME}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		bleed(data, info.width, info.height);
		await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${TMP}/in/${flat(f)}`);
	}
	const proc = Bun.spawn([BIN, "-i", `${TMP}/in`, "-o", `${TMP}/out`, "-m", `${BIN.replace(/\/[^/]+$/, "")}/models`, "-n", MODEL, "-s", "2", "-f", "png"], { stdout: "ignore", stderr: "pipe" });
	if ((await proc.exited) !== 0) throw new Error(`realesrgan failed: ${(await new Response(proc.stderr).text()).slice(-400)}`);
	for (const f of batch) {
		const out = `${TMP}/out/${flat(f)}`;
		if (!(await Bun.file(out).exists())) {
			console.warn("  missing", f);
			continue;
		}
		await sharp(out).webp({ quality: 88, alphaQuality: 100, effort: 4 }).toFile(`${GAME}/${hdName(f)}`);
	}
	console.log(`  ${Math.min(i + 24, todo.length)}/${todo.length}  ${Math.round((performance.now() - t0) / 1000)} s`);
}

// everything that has an HD twin, for the client to prefer
const hd: string[] = [];
for (const f of files) if (await Bun.file(`${GAME}/${hdName(f)}`).exists()) hd.push(f);
const prev: string[] = only.length && (await Bun.file(`${GAME}/hd.json`).exists()) ? await Bun.file(`${GAME}/hd.json`).json() : [];
await Bun.write(`${GAME}/hd.json`, JSON.stringify([...new Set([...prev, ...hd])].sort()));
console.log(`game-hd: done, ${hd.length} HD files`);
