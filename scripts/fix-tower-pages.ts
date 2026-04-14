#!/usr/bin/env bun
/**
 * Fix 3 tower pages (human, devil, god) that have broken nav table + duplicated content.
 */

import { readFile, writeFile } from "node:fs/promises";

const TOWER_NAMES: Record<string, string> = {
	human: "人類之塔",
	devil: "魔族之塔",
	god: "聖賢之塔",
};

for (const [slug, title] of Object.entries(TOWER_NAMES)) {
	const file = `content/docs/towers/${slug}.mdx`;
	const text = await readFile(file, "utf8");
	const fmMatch = text.match(/^---\n([\s\S]+?)\n---\n/);
	if (!fmMatch) continue;
	const fm = fmMatch[1];
	const body = text.slice(fmMatch[0].length);

	// Find the longest cell containing the tower title
	const lines = body.split("\n");
	const candidates: string[] = [];
	for (const line of lines) {
		if (!line.startsWith("|") || !line.includes(title)) continue;
		const cells = line
			.split("|")
			.map((c) => c.trim())
			.filter(Boolean);
		for (const cell of cells) {
			if (cell.startsWith(title) && cell.length > title.length + 20) {
				candidates.push(cell);
			}
		}
	}

	if (candidates.length === 0) {
		console.log(`  WARN ${slug}: no content cells`);
		continue;
	}

	const best = candidates.reduce((a, b) => (b.length > a.length ? b : a));

	// Strip title prefix
	let content = best.replace(new RegExp(`^${title}\\s*`), "");

	// Break into paragraphs on sentence boundaries
	content = content.replace(/\s+(入口NPC[:：])/g, "\n\n**$1**");
	content = content.replace(/\s+(開始前的對話[^\s]*)/g, "\n\n## $1\n");
	content = content.replace(/([。？！])\s+/g, "$1\n\n");

	const newBody = `\n# ${title}\n\n${content.trim()}\n`;
	await writeFile(file, `---\n${fm}\n---\n${newBody}`);
	console.log(`  FIXED ${slug}: ${content.length} chars`);
}
