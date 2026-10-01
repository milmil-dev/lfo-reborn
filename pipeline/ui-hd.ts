// HD versions of the original client's UI (data/assets/ui/**.png from ui.ts), keeping every
// original detail: 4× AI super-resolution (Real-ESRGAN, anime video model) instead of redrawing.
//   data/assets/ui-hd/<same path>.webp  (4× pixels, alpha kept)  + manifest.json { name: [w, h] }
// w/h are the original sizes: the web draws each piece at its original CSS size, so the extra
// pixels only show up as sharpness on high-DPI screens and when the 800 × 600 layout is scaled up.
//
// Needs realesrgan-ncnn-vulkan (https://github.com/xinntao/Real-ESRGAN/releases), by default at
// .cache/tools/realesrgan/ (override with REALESRGAN=/path/to/realesrgan-ncnn-vulkan).
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";

const ROOT = `${import.meta.dir}/..`;
const IN = `${ROOT}/data/assets/ui`;
const OUT = `${ROOT}/data/assets/ui-hd`;
const TMP = `${ROOT}/.cache/ui-hd`;
const BIN = process.env.REALESRGAN ?? `${ROOT}/.cache/tools/realesrgan/realesrgan-ncnn-vulkan`;
const MODEL = "realesr-animevideov3-x4";
const SCALE = 4;

if (!(await Bun.file(BIN).exists())) {
	console.error(`realesrgan-ncnn-vulkan not found at ${BIN}; download it from the Real-ESRGAN releases or set REALESRGAN`);
	process.exit(1);
}

/**
 * Text-free skins for buttons whose labels the remake changes: the label area is refilled from
 * a clean column of the same button, so only the texture remains.
 */
const DERIVED = [
	{ name: "derived/menu_blank", from: "interface/gamemenu10", x0: 12, x1: 170, y0: 0, y1: 38, srcX: 11 },
	{ name: "derived/title_blank", from: "intro/intromenupack3b1", x0: 18, x1: 123, y0: 5, y1: 31, srcX: 16 },
];

const manifest: Record<string, [number, number]> = await Bun.file(`${IN}/manifest.json`).json();
for (const d of DERIVED) {
	const { data, info } = await sharp(`${IN}/${d.from}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let y = d.y0; y < d.y1; y++)
		for (let x = d.x0; x < d.x1; x++) data.copy(data, (y * info.width + x) * 4, (y * info.width + d.srcX) * 4, (y * info.width + d.srcX) * 4 + 4);
	await mkdir(dirname(`${IN}/${d.name}.png`), { recursive: true });
	await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${IN}/${d.name}.png`);
	manifest[d.name] = [info.width, info.height];
}
await Bun.write(`${IN}/manifest.json`, JSON.stringify(manifest));

const only = process.argv.slice(2);
const names = Object.keys(manifest).filter((n) => !only.length || only.some((o) => n.startsWith(o)));

/**
 * Transparent pixels still carry whatever colour the original compositing left there; bleed the
 * nearest opaque colour into them so the upscaler doesn't smear dark or tinted halos into edges.
 */
function bleed(data: Buffer, w: number, h: number) {
	const solid = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] > 8 ? 1 : 0;
	for (let pass = 0; pass < 4; pass++) {
		const next = solid.slice();
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				if (solid[i]) continue;
				let r = 0, g = 0, b = 0, n = 0;
				for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
					const xx = x + dx, yy = y + dy;
					if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
					const j = yy * w + xx;
					if (!solid[j]) continue;
					r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
				}
				if (!n) continue;
				data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
				next[i] = 1;
			}
		solid.set(next);
	}
}

// stage every piece flat (a/b.png → a__b.png) so the upscaler runs once over one folder
await rm(TMP, { recursive: true, force: true });
await mkdir(`${TMP}/in`, { recursive: true });
await mkdir(`${TMP}/out`, { recursive: true });
const flat = (n: string) => n.replaceAll("/", "__");
for (const n of names) {
	const { data, info } = await sharp(`${IN}/${n}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	if (Math.min(info.width, info.height) < 8) {
		// 1-px nine-slice edges and the like: nothing for the model to see, a plain resize is exact
		await sharp(`${IN}/${n}.png`).resize(info.width * SCALE, info.height * SCALE, { kernel: "lanczos3" }).png().toFile(`${TMP}/out/${flat(n)}.png`);
		continue;
	}
	bleed(data, info.width, info.height);
	await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${TMP}/in/${flat(n)}.png`);
}

const t0 = performance.now();
const proc = Bun.spawn([BIN, "-i", `${TMP}/in`, "-o", `${TMP}/out`, "-m", `${dirname(BIN)}/models`, "-n", MODEL, "-s", String(SCALE), "-f", "png"], { stdout: "ignore", stderr: "pipe" });
if ((await proc.exited) !== 0) throw new Error(`realesrgan failed: ${(await new Response(proc.stderr).text()).slice(-400)}`);

const out: Record<string, [number, number]> = only.length && (await Bun.file(`${OUT}/manifest.json`).exists()) ? await Bun.file(`${OUT}/manifest.json`).json() : {};
let bytes = 0;
for (const n of names) {
	const src = `${TMP}/out/${flat(n)}.png`;
	if (!(await Bun.file(src).exists())) {
		console.warn("  missing", n);
		continue;
	}
	const file = `${OUT}/${n}.webp`;
	await mkdir(dirname(file), { recursive: true });
	await sharp(src).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toFile(file);
	out[n] = manifest[n];
	bytes += Bun.file(file).size;
}
await Bun.write(`${OUT}/manifest.json`, JSON.stringify(out));
console.log(`ui-hd: ${Object.keys(out).length} pieces ×${SCALE}, ${(bytes / 1e6).toFixed(1)} MB, ${Math.round((performance.now() - t0) / 1000)} s`);
