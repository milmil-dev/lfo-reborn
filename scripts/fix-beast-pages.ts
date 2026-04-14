#!/usr/bin/env bun
/**
 * Beast pages have broken duplicated table structure.
 * Extract clean data and rebuild as proper markdown tables.
 */

import { readFile, writeFile } from "node:fs/promises";

const BEASTS: Record<string, string> = {
	crawley: "克拉雷",
	dega: "狄加",
	nacala: "納卡拉",
	casso: "狂旺獸",
	gneuss: "格諾斯",
	duba: "杜巴",
	dashs: "達希斯",
};

interface Skill {
	num: string;
	input: string;
	cost: string;
}

interface Stat {
	name: string;
	base: string;
	perPoint: string;
}

function parseBeastPage(body: string): {
	normalSkills: Skill[];
	stats: Stat[];
	enhancedSkills: Skill[];
} {
	const lines = body.split("\n").filter((l) => l.startsWith("|"));
	const normalSkills: Skill[] = [];
	const stats: Stat[] = [];
	const enhancedSkills: Skill[] = [];

	for (const line of lines) {
		const cells = line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());

		// Top nav row (all beast names)
		if (cells.includes("克拉雷") && cells.includes("狄加")) continue;
		// Separator
		if (cells.every((c) => /^-*$/.test(c))) continue;
		// Section markers
		if (cells[0] === "招式名稱" && cells[1] === "出招方法") continue;
		if (cells[0] === "能力" && cells[1] === "能力值") continue;
		if (cells[0] === "普通版起初能力") continue;

		// Skill row: 技能N | 擋→X | NMP | or | 1 | 擋→X | 0MP |
		if (/^(技能\d|\d+)$/.test(cells[0]) && cells[1] && cells[2]) {
			const skill: Skill = {
				num: cells[0].replace(/^技能/, ""),
				input: cells[1],
				cost: cells[2],
			};
			// 0MP means enhanced version
			if (cells[2].startsWith("0")) {
				if (!enhancedSkills.find((s) => s.num === skill.num)) enhancedSkills.push(skill);
			} else {
				if (!normalSkills.find((s) => s.num === skill.num)) normalSkills.push(skill);
			}
			continue;
		}

		// Stat row: HP | 560 | 7 |
		if (/^(HP|MP|SP|STR|DEF|AGI)$/.test(cells[0]) && cells[1] && cells[2]) {
			if (!stats.find((s) => s.name === cells[0])) {
				stats.push({ name: cells[0], base: cells[1], perPoint: cells[2] });
			}
		}
	}

	return { normalSkills, stats, enhancedSkills };
}

function renderBeast(data: ReturnType<typeof parseBeastPage>): string {
	const { normalSkills, stats, enhancedSkills } = data;
	const parts: string[] = [];

	parts.push("## 起初能力");
	parts.push("");
	parts.push("| 能力 | 能力值 | 每加1點的效果 |");
	parts.push("|------|-------|-------------|");
	for (const s of stats) {
		parts.push(`| ${s.name} | ${s.base} | ${s.perPoint} |`);
	}
	parts.push("");

	if (normalSkills.length) {
		parts.push("## 普通版招式");
		parts.push("");
		parts.push("| 招式 | 出招方法 | 消耗能力 |");
		parts.push("|------|---------|---------|");
		for (const s of normalSkills) {
			parts.push(`| 技能${s.num} | ${s.input} | ${s.cost} |`);
		}
		parts.push("");
	}

	if (enhancedSkills.length) {
		parts.push("## 強化版招式");
		parts.push("");
		parts.push("| 招式 | 出招方法 | 消耗能力 |");
		parts.push("|------|---------|---------|");
		for (const s of enhancedSkills) {
			parts.push(`| 技能${s.num} | ${s.input} | ${s.cost} |`);
		}
		parts.push("");
	}

	return parts.join("\n");
}

for (const [slug, cnName] of Object.entries(BEASTS)) {
	const file = `content/docs/beast/${slug}.mdx`;
	const text = await readFile(file, "utf8");
	const fmMatch = text.match(/^---\n([\s\S]+?)\n---\n/);
	if (!fmMatch) continue;
	const body = text.slice(fmMatch[0].length);

	const data = parseBeastPage(body);
	const content = renderBeast(data);

	// New frontmatter with proper title
	const newFm = `title: ${cnName}\ndescription: 兇獸檔案 - ${cnName}`;
	await writeFile(file, `---\n${newFm}\n---\n\n${content}`);
	console.log(
		`  FIXED ${slug}: ${data.normalSkills.length} skills, ${data.stats.length} stats, ${data.enhancedSkills.length} enhanced`,
	);
}
