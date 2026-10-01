// Exports the original client's UI kit (ZPAK/INTERFACE/interface.pak) piece by piece:
// data/assets/ui/<folder>/<name>.png + data/assets/ui/manifest.json { name: [w, h] }.
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { composite, readPak, unpackLfo } from "./lfo";

const OUT = `${import.meta.dir}/../data/assets/ui`;
// folders that are not interface chrome (banners, credits, CG stills): skipped to keep the kit lean
const SKIP = /^(notice|ending_creditlist\d*|p8ending|ver\d+|pack\d+|p9s5|pic|special|intro\/view)/;

const pak = await unpackLfo("pak.lfo");
const pieces = await readPak(`${pak}/ZPAK/INTERFACE/interface.pak`);
const manifest: Record<string, [number, number]> = {};
let n = 0;
for (const [name, list] of pieces) {
	if (SKIP.test(name) || !/\.(png|jpg|bmp|tga)$/i.test(name)) continue;
	const file = `${OUT}/${name.toLowerCase().replace(/\.\w+$/, ".png")}`;
	try {
		const png = await composite(list, "interface");
		await mkdir(dirname(file), { recursive: true });
		await Bun.write(file, png);
		const { width, height } = await sharp(png).metadata();
		manifest[name.toLowerCase().replace(/\.\w+$/, "")] = [width ?? 0, height ?? 0];
		n++;
	} catch (e) {
		console.warn("skip", name, (e as Error).message);
	}
}
await Bun.write(`${OUT}/manifest.json`, JSON.stringify(manifest));
console.log(`ui pieces ${n}`);
