// The client's shop stock lists (SHOP/item.dat.tzw, weapon.dat.tzw, armor.dat.tzw):
//   data/assets/game/shops.json  { item: [...], weapon: [...], armor: [...] }
// Each file is a little-endian u32 length followed by a zlib stream of 12-byte records
// (item id, price, chance %). An id listed n times is n units on the shelf; `chance` is read as
// the odds a unit is in stock when you walk in (rare swords sit at 21 %, sodas at 100 %).
import { inflateSync } from "node:zlib";
import { SRC } from "./lfo";

const OUT = `${import.meta.dir}/../data/assets/game`;
type Entry = { id: number; price: number; chance: number; units: number };

async function readShop(name: string): Promise<Entry[]> {
	const b = Buffer.from(await Bun.file(`${SRC}/SHOP/${name}.dat.tzw`).arrayBuffer());
	const raw = inflateSync(b.subarray(4));
	const out: Entry[] = [];
	for (let i = 0; i + 12 <= raw.length; i += 12) {
		const id = raw.readInt32LE(i);
		const price = raw.readInt32LE(i + 4);
		const chance = raw.readInt32LE(i + 8);
		const same = out.find((e) => e.id === id && e.price === price && e.chance === chance);
		if (same) same.units++;
		else out.push({ id, price, chance, units: 1 });
	}
	return out;
}

const shops = { item: await readShop("item"), weapon: await readShop("weapon"), armor: await readShop("armor") };
await Bun.write(`${OUT}/shops.json`, JSON.stringify(shops));
console.log(`shops: ${Object.entries(shops).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
