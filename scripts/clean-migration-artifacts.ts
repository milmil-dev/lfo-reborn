#!/usr/bin/env bun
/**
 * Clean migration artifacts from all MDX content pages.
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

function parseFrontmatter(text: string): { title?: string; body: string; fmEnd: number } {
	if (!text.startsWith("---\n")) return { body: text, fmEnd: 0 };
	const end = text.indexOf("\n---\n", 4);
	if (end === -1) return { body: text, fmEnd: 0 };
	const fm = text.slice(4, end);
	const titleMatch = fm.match(/^title:\s*"?([^"\n]+?)"?\s*$/m);
	return {
		title: titleMatch?.[1]?.trim(),
		body: text.slice(end + 5),
		fmEnd: end + 5,
	};
}

let filesChanged = 0;
let artifactsRemoved = 0;

async function clean(file: string) {
	const original = await readFile(file, "utf8");
	const { title, body, fmEnd } = parseFrontmatter(original);
	let newBody = body;
	let changed = false;

	// 1. Strip LTR marks (U+200E) and zero-width chars
	if (/[\u200e\u200f\u200b]/.test(newBody)) {
		newBody = newBody.replace(/[\u200e\u200f\u200b]/g, "");
		changed = true;
		artifactsRemoved++;
	}

	// 2. Remove `XXX - LFO資料博物館` lines
	if (/^.*\s*-\s*LFO資料博物館\s*$/m.test(newBody)) {
		newBody = newBody.replace(/^.*\s*-\s*LFO資料博物館\s*$/gm, "");
		changed = true;
		artifactsRemoved++;
	}

	// 3. Remove empty `### ` headings
	if (/^#{2,4}\s*$/m.test(newBody)) {
		newBody = newBody.replace(/^#{2,4}\s*$/gm, "");
		changed = true;
		artifactsRemoved++;
	}

	// 4. Remove lines that are purely navigation remnants
	// Pattern: any line containing 回到大廳 (they're all nav remnants)
	if (/回到大廳/.test(newBody)) {
		newBody = newBody.replace(/^.*回到大廳.*$/gm, "");
		changed = true;
		artifactsRemoved++;
	}

	// Pattern: standalone 回到目錄 lines (possibly with ★)
	if (/^\s*★?\s*回到目錄\s*$/m.test(newBody)) {
		newBody = newBody.replace(/^\s*★?\s*回到目錄\s*$/gm, "");
		changed = true;
		artifactsRemoved++;
	}

	// 5. Remove `點我回到大廳` / `點我查看XXX` standalone nav links
	if (/^\s*點我\S.*$/m.test(newBody)) {
		newBody = newBody.replace(/^\s*點我[^\n]*回到[^\n]*$/gm, "");
		changed = true;
	}

	// 6. Fix H1 to match frontmatter title
	if (title) {
		const h1Re = /^#\s+(.+?)\s*$/m;
		const h1Match = newBody.match(h1Re);
		if (h1Match && h1Match[1] !== title) {
			newBody = newBody.replace(h1Re, `# ${title}`);
			changed = true;
			artifactsRemoved++;
		}
	}

	// 7. Collapse 3+ consecutive blank lines to 2
	if (/\n{4,}/.test(newBody)) {
		newBody = newBody.replace(/\n{4,}/g, "\n\n\n");
		changed = true;
	}

	// 8. Trim trailing whitespace from lines
	newBody = newBody.replace(/[ \t]+$/gm, "");
	newBody = newBody.replace(/\n{3,}$/, "\n");

	if (changed && newBody !== body) {
		await writeFile(file, original.slice(0, fmEnd) + newBody);
		filesChanged++;
		return true;
	}
	return false;
}

const files = await walk(CONTENT_DIR);
console.log(`Scanning ${files.length} MDX files...`);

for (const file of files) {
	await clean(file);
}

console.log(`Done. ${filesChanged} files changed. ${artifactsRemoved} artifact types removed.`);
