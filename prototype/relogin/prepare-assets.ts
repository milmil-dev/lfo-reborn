// Pulls the handful of assets this prototype needs straight out of the original LFO client.
// Usage: LFO_SRC=/path/to/lfo-master bun prepare-assets.ts
import zlib from "node:zlib";
import { copyFile, mkdir } from "node:fs/promises";

const SRC = (() => {
  const src = process.env.LFO_SRC;
  if (!src) {
    throw new Error(
      "Set LFO_SRC to your original LFO client path (e.g. /path/to/lfo-master).",
    );
  }
  return src;
})();
const OUT = `${import.meta.dir}/assets`;

const IMAGES = new Set([
	// prologue panorama (800 wide: 511 + 289 tiles), sky -> sea -> cliff -> forest
	"interface20.png", "interface21.png", "interface22.png", "interface23.png",
	"interface24.png", "interface25.png", "interface26.png", "interface27.png", "interface28.png",
	"interface9.png", // title key art
	"interface12.png", // 第一話 學校 title strip
	"interface13.png", // glowing LFO logo
	"face55.png", "face56.png", // 星奇
	"face27.png", "face28.png", // 域多 / 歷奇
	"face25.png", "face13.png",
	"school1b.png", "school2_base.png", "school2_front2.png", "school2_front3.png", "school2_tree.png", "school2_rob.png",
]);
const AUDIO = [
	"BGM/lfo_theme.ogg", "BGM/lfo_intro2_2.ogg", "BGM/lfo_school1.ogg",
	"SFX/pick.wav", "SFX/johnnyconfirm.wav", "SFX/stinky1.wav", "SFX/Victor1.wav", "SFX/ricky_sp1.wav",
];

// .tzw: u32 indexCompressedLen, u32 indexLen, zlib(index), then PNG blobs back to back.
// Blobs are located by PNG signature and matched to index names in order; packs whose
// blob count differs from the name count (zero-size entries) are skipped for now.
function* unpack(buf: Uint8Array) {
	const clen = new DataView(buf.buffer, buf.byteOffset).getUint32(0, true);
	const index = new TextDecoder("latin1").decode(zlib.inflateSync(buf.subarray(8, 8 + clen)));
	const names = [...index.matchAll(/[\w-]+\.png/gi)].map((m) => m[0]);
	const starts: number[] = [];
	for (let i = 8 + clen; i < buf.length - 8; i++)
		if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4e && buf[i + 3] === 0x47 && buf[i + 4] === 0x0d)
			starts.push(i);
	if (starts.length !== names.length) return;
	for (let k = 0; k < names.length; k++) yield { name: names[k], data: buf.subarray(starts[k], starts[k + 1] ?? buf.length) };
}

await mkdir(`${OUT}/img`, { recursive: true });
await mkdir(`${OUT}/audio`, { recursive: true });

const found = new Set<string>();
for (const pack of new Bun.Glob("*.tzw").scanSync(SRC)) {
	if (found.size === IMAGES.size) break;
	const buf = new Uint8Array(await Bun.file(`${SRC}/${pack}`).arrayBuffer());
	try {
		for (const { name, data } of unpack(buf)) {
			if (!IMAGES.has(name) || found.has(name)) continue;
			await Bun.write(`${OUT}/img/${name}`, data);
			found.add(name);
		}
	} catch {
		// not every .tzw is an image pack
	}
}
for (const a of AUDIO) await copyFile(`${SRC}/${a}`, `${OUT}/audio/${a.split("/").pop()}`);

const missing = [...IMAGES].filter((n) => !found.has(n));
console.log(`images ${found.size}/${IMAGES.size}, audio ${AUDIO.length}`);
if (missing.length) console.warn("missing:", missing.join(", "));
