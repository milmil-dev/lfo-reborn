#!/usr/bin/env bun
/**
 * Many migrated pages wrap their entire content in a 2-column table
 * where one cell contains a breadcrumb like `博物館大廳 > X > Y` followed
 * by the actual prose.
 *
 * This script:
 *   1. Detects `| | 博物館大廳 > ... | content |` single-row tables
 *   2. Extracts just the prose content (stripping breadcrumb prefix)
 *   3. Removes the table wrapper (including the `|----|` separator)
 *   4. Breaks long prose into paragraphs on sentence boundaries
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CONTENT_DIR = "content/docs";

async function walk(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(full)));
		else if (entry.name.endsWith(".mdx")) files.push(full);
	}
	return files;
}

function unwrapBreadcrumbContent(body: string): { result: string; changed: boolean } {
	const lines = body.split("\n");
	const out: string[] = [];
	let changed = false;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Match single-row breadcrumb table: `| | 博物館大廳 ... |` or `| 博物館大廳 ... |`
		if (/^\|\s*\|?.*博物館大廳/.test(line) && line.startsWith("|") && line.endsWith("|")) {
			// Extract cells
			const cells = line
				.split("|")
				.slice(1, -1)
				.map((c) => c.trim());

			// Find the cell with the actual content (longest cell containing breadcrumb)
			let contentCell = cells.reduce((a, b) => (b.length > a.length ? b : a), "");

			// Strip breadcrumb prefix: `博物館大廳 > X > Y ` or `博物館大廳 ‎ > ‎ X ‎ > ‎ Y `
			contentCell = contentCell.replace(
				/^博物館大廳\s*(?:‎\s*)?(?:&gt;|>)\s*[^>&]+\s*(?:&gt;|>)\s*[^\s]+\s*/,
				"",
			);

			// Also strip any leading `LFO官網移植計劃 之 XXX` and date stamp
			contentCell = contentCell.replace(/^LFO官網移植計劃\s*之\s*\S+\s*/, "");
			contentCell = contentCell.replace(/^\[(\d{4}-\d{2}-\d{2})\]\s*/, "📅 $1\n\n");

			// Break into paragraphs on 。！？ followed by space/content
			contentCell = contentCell.replace(/([。！？])\s{2,}/g, "$1\n\n");
			contentCell = contentCell.replace(/\s+([A-Za-z0-9]+[問答]\s*[：:])/g, "\n\n$1");

			// Clean leftover 回到大廳 type fragments
			contentCell = contentCell.replace(/\s*回到(?:大廳|目錄|連載目錄)\s*★?\s*/g, "");

			out.push(contentCell.trim());

			// Skip the table separator line if it follows
			if (i + 1 < lines.length && /^\|[-:|\s]+\|$/.test(lines[i + 1])) {
				i += 2;
			} else {
				i += 1;
			}
			changed = true;
			continue;
		}

		out.push(line);
		i++;
	}

	return { result: out.join("\n"), changed };
}

function parseFrontmatter(text: string): { fmEnd: number; body: string } {
	if (!text.startsWith("---\n")) return { fmEnd: 0, body: text };
	const end = text.indexOf("\n---\n", 4);
	if (end === -1) return { fmEnd: 0, body: text };
	return { fmEnd: end + 5, body: text.slice(end + 5) };
}

let filesChanged = 0;
const files = await walk(CONTENT_DIR);
console.log(`Scanning ${files.length} MDX files...`);

for (const file of files) {
	const original = await readFile(file, "utf8");
	if (!original.includes("博物館大廳")) continue;

	const { fmEnd, body } = parseFrontmatter(original);
	const { result, changed } = unwrapBreadcrumbContent(body);

	if (changed) {
		// Collapse excess blank lines
		const cleaned = result.replace(/\n{4,}/g, "\n\n\n").replace(/[ \t]+$/gm, "");
		await writeFile(file, original.slice(0, fmEnd) + cleaned);
		filesChanged++;
	}
}

console.log(`Done. ${filesChanged} files unwrapped.`);
