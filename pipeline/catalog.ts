// The client's own list of playable stages (LOADSTORYLIST/loadstorylist*.dat), as one catalog:
//   data/assets/game/stories/catalog.json
//   [{ key, mode, area, leadId, lead, players, synopsis, exported }]
// Each .dat line is `<mode> <charId> story/<folder>/<name>.sty|stz` — mode 10 story, 20 mission,
// 0 VS; `~` lines are disabled. A stage is listed once per character with the file that character
// plays (Woody plays davis_greek1, Kiki dennis_china5), and charId 0 names the file for anyone
// without a line of their own (stinky_school): a stage with no 0 line (egypt) is only for the
// characters it names. `players` keeps every charId that plays the file.
// The title is the client's own stage name: the .sty `sty <id>` row indexes STORY/MISC/stagename.tzw.
// The synopsis is the first line of the stage's string table (its opening narration).
import { readStrings, unpackLfo } from "./lfo";

const ROOT = `${import.meta.dir}/..`;
const OUT = `${ROOT}/data/assets/game`;
const ls = await unpackLfo("loadstorylist.lfo");
const str = await unpackLfo("hk/string.lfo", "string_hk");
const storyDir = await unpackLfo("story.lfo");

// every .sty by its lower-case name, and the stage names they point at
const styFiles = new Map<string, string>();
for (const f of new Bun.Glob("**/*.st[yz]").scanSync(storyDir))
	styFiles.set(f.split("/").pop()!.toLowerCase().replace(/\.st[yz]$/, ""), `${storyDir}/${f}`);
const stageNames = await readStrings(`${str}/STORY/MISC/stagename.tzw`);
async function stageName(key: string) {
	const path = styFiles.get(key);
	if (!path) return "";
	const id = (await Bun.file(path).text()).match(/^sty\s+(\d+)/m)?.[1];
	return (id && stageNames.get(Number(id))) || "";
}

type Entry = {
	key: string;
	/** the stage this is a line of (davis_school and stinky_school are both "school") */
	stage: string;
	/** 1-based position of the stage in the client's order: 第 n 話 */
	chapter: number;
	title: string;
	mode: "story" | "mission" | "vs" | "tower";
	area: string;
	leadId: number;
	lead: string | null;
	/** charIds whose line plays this file; 0 = anyone the stage gives no line of their own */
	players: number[];
	synopsis: string;
	exported: boolean;
};

const chars: { key: string; id: number; name: string }[] = await Bun.file(`${OUT}/chars/index.json`).json();
const byId = new Map(chars.map((c) => [c.id, c]));
const exported = new Set<string>(
	(await Bun.file(`${OUT}/stories/index.json`).exists()) ? await Bun.file(`${OUT}/stories/index.json`).json() : [],
);

const strings = new Map<string, string>();
for (const f of new Bun.Glob("**/*_string.tzw").scanSync(str))
	if (!/(^|\/)_tw\//i.test(f)) strings.set(f.split("/").pop()!.toLowerCase().replace(/_string\.tzw$/, ""), `${str}/${f}`);

const MODES: Record<string, Entry["mode"]> = { "10": "story", "20": "mission", "0": "vs" };
const seen = new Map<string, Entry>();
const lists = [...new Bun.Glob("**/loadstorylist*.dat").scanSync(ls)]
	.filter((f) => !/_tw\.dat$/i.test(f) && !f.endsWith(".bak"))
	// loadstorylist.dat, then 2, 3 … in the client's order
	.sort((a, b) => Number(a.match(/(\d+)\.dat$/)?.[1] ?? 0) - Number(b.match(/(\d+)\.dat$/)?.[1] ?? 0));
for (const f of lists) {
	for (const raw of (await Bun.file(`${ls}/${f}`).text()).split(/\r?\n/)) {
		const m = raw.trim().match(/^(\d+)\s+(\d+)\s+story[\\/](.+?)[\\/]([^\\/\s]+)\.st[yz]$/i);
		if (!m) continue; // comments, blank and ~disabled lines
		const [, mode, charId, folder, name] = m;
		const key = name.toLowerCase();
		if (!MODES[mode]) continue;
		const known = seen.get(key);
		if (known) {
			if (!known.players.includes(Number(charId))) known.players.push(Number(charId));
			continue;
		}
		const lead = byId.get(Number(charId));
		let synopsis = "";
		const sp = strings.get(key);
		if (sp) synopsis = ([...(await readStrings(sp)).values()][0] ?? "").replace(/\s+/g, " ").trim();
		seen.set(key, {
			key,
			stage: "",
			chapter: 0,
			title: "",
			mode: MODES[mode],
			area: folder.toLowerCase().split(/[\\/]/)[0],
			leadId: Number(charId),
			lead: lead?.key ?? null,
			players: [Number(charId)],
			synopsis,
			exported: exported.has(key),
		});
	}
}
// 死亡之塔: entered from NPCs on the street rather than the stage list, so LOADSTORYLIST
// leaves them out — 人類之塔 (tower01), 魔族之塔 (tower02), 聖賢之塔 (tower03) and the lantau one
for (const key of ["tower01", "tower02", "tower03", "tower_lantau"])
	if (!seen.has(key))
		seen.set(key, {
			key,
			stage: key,
			chapter: 0,
			title: "",
			mode: "tower",
			area: "tower",
			leadId: 0,
			lead: null,
			players: [0],
			synopsis: "",
			exported: exported.has(key),
		});

/* ───────── stages, chapter numbers and titles ───────── */

const charKeys = new Set(chars.map((c) => c.key));
/** davis_school → school, p4s6_stinky → p4s6, p14s5b → p14s5 */
function stageOf(key: string) {
	const p = key.split("_");
	if (/^p\d/.test(key)) return (p.length > 1 && charKeys.has(p.at(-1)!) ? p.slice(0, -1).join("_") : key).replace(/b$/, "");
	return charKeys.has(p[0]) || p[0] === "jessie" ? p.slice(1).join("_") : key;
}
// Titles from the old museum's story pages (legacy/data/stories.json, by arc). Their arcs follow the
// client's stage order; anchored on the stages whose opening narration names the arc (p5s2 絕地猛虎 = 31,
// p7s1 不死英雄 = 39, p9s3 古龍騎士 = 47). China 1–3 … 魔界 split into more stages than there are arcs,
// and pack 11 on drifts, so those keep area / version names instead of a guessed title.
const legacy: { arc: number; title: string }[] = await Bun.file(`${ROOT}/legacy/data/stories.json`).json();
const arcTitle = new Map<number, string>();
for (const l of legacy) if (!arcTitle.has(l.arc)) arcTitle.set(l.arc, l.title.split("（")[0]);
const AREA: Record<string, string> = {
	school: "學校", coliseum: "體育館", lantau: "大嶼山", icefire: "冰火皇后島", china: "中國", egypt: "埃及",
	greek: "希臘", swamp: "死亡沼澤", devil: "魔界", japan: "日本", usa: "美國",
};
const ANCHORED: [first: string, arc: number, last: string][] = [
	["school", 1, "icefire"],
	["china4", 14, "p10s4"],
];

const all = [...seen.values()];
const stageOrder: string[] = [];
for (const e of all) if (e.mode === "story" && !stageOrder.includes(stageOf(e.key))) stageOrder.push(stageOf(e.key));
const titles = new Map<string, string>();
for (const [first, arc, last] of ANCHORED) {
	const a = stageOrder.indexOf(first);
	const b = stageOrder.indexOf(last);
	for (let i = a; i >= 0 && i <= b; i++) titles.set(stageOrder[i], arcTitle.get(arc + i - a) ?? "");
}
for (const e of all) {
	e.stage = stageOf(e.key);
	e.chapter = stageOrder.indexOf(e.stage) + 1;
	if (!e.lead) {
		const prefix = e.key.split("_")[0];
		const tail = e.key.split("_").at(-1)!;
		e.lead = charKeys.has(prefix) ? prefix : /^p\d/.test(e.key) && charKeys.has(tail) ? tail : null;
	}
	const m = e.stage.match(/^([a-z]+)(\d*)$/);
	const pack = e.stage.match(/^p(\d+)s(\d+)$/);
	e.title =
		(await stageName(e.key)) ||
		titles.get(e.stage) ||
		(pack ? `第${pack[1]}版 · 第${pack[2]}節` : m && AREA[m[1]] ? `${AREA[m[1]]}${m[2] ? ` ${m[2]}` : ""}` : e.key);
}
await Bun.write(`${OUT}/stories/catalog.json`, JSON.stringify(all));
const count = (m: Entry["mode"]) => all.filter((e) => e.mode === m).length;
console.log(
	`catalog: ${count("story")} stories, ${count("mission")} missions, ${count("vs")} VS stages, ${count("tower")} towers`,
);
