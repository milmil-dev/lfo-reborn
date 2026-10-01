// The original create-character screen's roster (profile.tzw in the client root):
// per character its head / full-body art, the six bar values shown (HP MP SP STR AGI DEF, 0–100)
// and four "scan" points on the body the screen's rings and labels orbit.
// Writes data/assets/game/profile.json.
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { SRC } from "./lfo";

const UI_HD = `${import.meta.dir}/../data/assets/ui-hd/profile`;

const OUT = `${import.meta.dir}/../data/assets/game/profile.json`;
const lines = (await Bun.file(`${SRC}/profile.tzw`).text())
	.replace(/\r/g, "")
	.split("\n")
	.filter((l) => l.trim() && !l.startsWith("//"));

const nums = (l: string) => l.trim().split(/\s+/).map(Number);
const entries = [];
for (let i = 1; i + 6 < lines.length + 1 && i < lines.length; i += 7) {
	const [id, key, head, big, bars, a, b] = lines.slice(i, i + 7);
	const p = [...nums(a), ...nums(b)];
	entries.push({
		id: Number(id),
		key: key.trim().toLowerCase(),
		head: head.trim().replace(/\.png$/, ""),
		big: big.trim().replace(/\.png$/, ""),
		bars: nums(bars),
		points: [
			[p[0], p[1]],
			[p[2], p[3]],
			[p[4], p[5]],
			[p[6], p[7]],
		],
	});
}
// the file also lists creatures and characters that borrow another's art: keep the real ones, once
const seen = new Set<string>();
const roster = entries.filter((e) => e.id < 3000 && e.head === `${e.key}_head` && !seen.has(e.key) && seen.add(e.key));

// profile.tzw is the first versions' list (22 characters); the ones added later came with the
// boxed versions and character cards. The remake offers them all, after the original 22: their
// select art is the client's own profile/<key>_head / _big (the "p" variants use the base
// character's), the bars are their base stats scaled into the list's 0–100 range, and the scan
// points are the ones most entries of the file share.
const db = new Database(`${import.meta.dir}/../data/lfo.db`, { readonly: true });
type Row = { id: number; key: string; stats_default: string };
const rows = db.query("SELECT id, key, stats_default FROM characters WHERE head IS NOT NULL AND id < 7000").all() as Row[];
const index = (await Bun.file(`${import.meta.dir}/../data/assets/game/chars/index.json`).json()) as { key: string; id: number }[];
const art = (key: string) =>
	[key, key.replace(/p$/, "")].find((k) => existsSync(`${UI_HD}/${k}_head.webp`) && existsSync(`${UI_HD}/${k}_big.webp`));
const stats = rows.map((r) => ({ ...r, s: JSON.parse(r.stats_default) as Record<string, number> }));
const ORDER = ["hp", "mp", "sp", "str", "agi", "def"];
const range = ORDER.map((k) => {
	const v = stats.map((r) => r.s[k] ?? 0);
	return [Math.min(...v), Math.max(...v)];
});
const bar = (s: Record<string, number>) =>
	ORDER.map((k, i) => {
		const [lo, hi] = range[i];
		return Math.round(40 + (50 * ((s[k] ?? lo) - lo)) / Math.max(1, hi - lo));
	});
const shared = roster[0].points;
const extra = [];
for (const c of [...index].sort((a, b) => a.id - b.id)) {
	if (c.id >= 7000 || seen.has(c.key)) continue;
	const st = stats.find((r) => r.id === c.id);
	const a = art(c.key);
	if (!st || !a) continue;
	seen.add(c.key);
	extra.push({ id: c.id, key: c.key, head: `${a}_head`, big: `${a}_big`, bars: bar(st.s), points: shared, extra: true });
}
await Bun.write(OUT, JSON.stringify([...roster, ...extra]));
console.log(`profile: ${roster.length} from profile.tzw + ${extra.length} more`, extra.map((e) => e.key).join(" "));
