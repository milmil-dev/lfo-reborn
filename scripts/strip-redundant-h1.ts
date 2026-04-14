#!/usr/bin/env bun
/**
 * Strip the leading H1 from MDX content since DocsPage already renders
 * the title via DocsTitle (from frontmatter). Keeping both causes
 * duplicated titles on every page.
 *
 * Only strips the FIRST H1 if it appears at the top of the body (within
 * the first few non-empty lines) — preserves H1s used deeper in content.
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

let filesChanged = 0;
const files = await walk(CONTENT_DIR);

for (const file of files) {
	const text = await readFile(file, "utf8");
	if (!text.startsWith("---\n")) continue;
	const fmEnd = text.indexOf("\n---\n", 4);
	if (fmEnd === -1) continue;
	const body = text.slice(fmEnd + 5);

	// Look for the first H1 within the first 5 non-empty lines
	const lines = body.split("\n");
	let firstContentIdx = -1;
	for (let i = 0; i < Math.min(lines.length, 10); i++) {
		if (lines[i].startsWith("# ")) {
			firstContentIdx = i;
			break;
		}
		if (lines[i].trim() !== "") {
			// Found non-empty non-H1 content first — no leading H1 to strip
			break;
		}
	}

	if (firstContentIdx === -1) continue;

	// Remove the H1 line (and trailing blank if present)
	const newLines = [...lines];
	newLines.splice(firstContentIdx, 1);
	// Also remove leading blank lines
	while (newLines[0] === "") newLines.shift();

	const newBody = `\n${newLines.join("\n")}`;

	if (newBody !== body) {
		await writeFile(file, text.slice(0, fmEnd + 5) + newBody);
		filesChanged++;
	}
}

console.log(`Stripped leading H1 from ${filesChanged} files.`);
