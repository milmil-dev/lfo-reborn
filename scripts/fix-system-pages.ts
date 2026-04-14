#!/usr/bin/env bun
/**
 * System pages have a broken nav table + duplicated content pattern.
 * This script extracts the real content and replaces the broken table structure.
 *
 * Original structure per page:
 *   | 合體系統 | | | | |        ← nav table starts
 *   |------|...|
 *   | 暗黑戰神介紹 | | | | |
 *   ... (11 nav rows)
 *   | | | | ACTUAL_CONTENT | ACTUAL_CONTENT |   ← content duplicated in cells
 *   | | | | ACTUAL_CONTENT | ACTUAL_CONTENT |   ← repeated
 *
 * Strategy: find the first content cell (non-empty cell past the nav rows),
 * extract it, then rewrite the body with just the title's content.
 */

import { readFile, writeFile } from "node:fs/promises";

const SYSTEM_DIR = "content/docs/system";

const systemPages = [
	"chardata",
	"darkchar",
	"exp",
	"he-ti",
	"momo",
	"monster",
	"skilllv",
	"stage",
	"tower",
	"trade",
	"tran",
];

function parseFrontmatter(text: string): { fm: string; title: string; body: string } {
	const m = text.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
	if (!m) throw new Error("No frontmatter");
	const titleMatch = m[1].match(/^title:\s*"?([^"\n]+?)"?\s*$/m);
	return { fm: m[1], title: titleMatch?.[1] ?? "", body: m[2] };
}

function extractContent(body: string, title: string): string {
	// Find all table cell contents that contain the title
	// Pattern: cells like `| CONTENT |` where CONTENT starts with the title
	const lines = body.split("\n");
	const contentCandidates: string[] = [];

	for (const line of lines) {
		if (!line.startsWith("|") || !line.includes(title)) continue;
		// Split on | and find cells that start with the title
		const cells = line
			.split("|")
			.map((c) => c.trim())
			.filter(Boolean);
		for (const cell of cells) {
			if (cell.startsWith(title) && cell.length > title.length + 5) {
				contentCandidates.push(cell);
			}
		}
	}

	if (contentCandidates.length === 0) {
		// Fallback: look for non-table paragraphs
		const nonTableLines = lines.filter((l) => !l.startsWith("|") && l.trim());
		return nonTableLines.join("\n\n");
	}

	// Pick the longest one (most complete)
	const best = contentCandidates.reduce((a, b) => (b.length > a.length ? b : a));

	// Strip the title prefix (it's redundant with the H1) and split into sentences/paragraphs
	let content = best.replace(new RegExp(`^${title}\\s*`), "");

	// Break into paragraphs on sentence boundaries (。！？ followed by space)
	// Also split on numbered lists (1. 2. 3.)
	content = content.replace(/([。！？])\s+/g, "$1\n\n");
	content = content.replace(/\s+(\d+[.、])/g, "\n\n$1");

	return content.trim();
}

let changed = 0;
for (const page of systemPages) {
	const file = `${SYSTEM_DIR}/${page}.mdx`;
	const text = await readFile(file, "utf8");
	const { fm, title, body } = parseFrontmatter(text);

	// Check if body still has the broken nav table (skip already-fixed pages)
	const hasNavTable = /^\|\s*合體系統\s*\|/m.test(body);

	if (!hasNavTable) {
		console.log(`  SKIP ${page} (already clean or different structure)`);
		continue;
	}

	const content = extractContent(body, title);
	if (!content) {
		console.log(`  WARN ${page}: could not extract content`);
		continue;
	}

	const newBody = `\n# ${title}\n\n${content}\n`;
	await writeFile(file, `---\n${fm}\n---\n${newBody}`);
	console.log(`  FIXED ${page}: ${content.length} chars extracted`);
	changed++;
}

console.log(`\n${changed} system pages fixed.`);
