// 異轉信物: which characters can transform and the name of each one's relic card.
//   data/assets/game/relics.json  [{ id, key, name, form, relic }]
// The relic names come from the old museum's transform pages (legacy/data/transforms.json); a
// character is listed only when the client has its transformed form (base id + 7000).
const OUT = `${import.meta.dir}/../data/assets/game`;

type Legacy = Record<string, { relic?: string }>;
const legacy = (await Bun.file(`${import.meta.dir}/../legacy/data/transforms.json`).json()) as Legacy;
const index = (await Bun.file(`${OUT}/chars/index.json`).json()) as { key: string; id: number; name: string }[];

// the museum's slugs where they differ from the sprite keys
const ALIAS: Record<string, string> = {
	cuite: "cutie",
	louisex: "louis",
	louis: "louiss",
	chiyua: "chiyuap",
	dilun: "diluns",
	king: "kingp",
};

const byKey = new Map(index.map((c) => [c.key, c]));
const byId = new Map(index.map((c) => [c.id, c]));
const out: { id: number; key: string; name: string; form: string; relic: string }[] = [];
for (const [slug, t] of Object.entries(legacy)) {
	const base = byKey.get(ALIAS[slug] ?? slug);
	const form = base && byId.get(base.id + 7000);
	if (!base || !form || !t.relic) continue;
	out.push({ id: base.id, key: base.key, name: base.name, form: form.key, relic: t.relic });
}
out.sort((a, b) => a.id - b.id);
await Bun.write(`${OUT}/relics.json`, JSON.stringify(out));
console.log(`relics: ${out.length} of ${Object.keys(legacy).length}`);
