#!/usr/bin/env bun
/**
 * good/comic.mdx has 18 LFO 漫畫書 entries wrapped in broken table.
 * Extract and rebuild as clean manga list.
 */

import { readFile, writeFile } from "node:fs/promises";

interface Comic {
	volume: string;
	title: string;
	price: string;
	date: string;
	summary: string;
}

function parseComics(body: string): Comic[] {
	const comics = new Map<string, Comic>();
	const lines = body.split("\n");

	for (const line of lines) {
		if (!line.includes("LFO 漫畫書")) continue;
		const cells = line
			.split("|")
			.map((c) => c.trim())
			.filter(Boolean);

		for (const cell of cells) {
			if (!cell.includes("LFO 漫畫書")) continue;

			// Pattern: "產品名稱：LFO 漫畫書 卷X XXXX"
			const titleMatch = cell.match(/產品名稱：LFO 漫畫書\s+(卷\S+)\s+(\S.*?)(?=\s+售價)/);
			if (!titleMatch) continue;
			const key = titleMatch[1];
			if (comics.has(key)) continue;

			const priceMatch = cell.match(/售價：([^\s]+)/);
			const dateMatch = cell.match(/發售日期：\s*(\S+(?:\d+日)?)/);
			const summaryMatch = cell.match(/內容簡介：\s*(.+?)$/);

			comics.set(key, {
				volume: key,
				title: titleMatch[2].replace(/\s*\(漫畫節特別版\)$/, ""),
				price: priceMatch?.[1] ?? "",
				date: dateMatch?.[1] ?? "",
				summary: summaryMatch?.[1]?.trim().replace(/\s+/g, " ") ?? "",
			});
		}
	}

	return Array.from(comics.values());
}

const file = "content/docs/good/comic.mdx";
const text = await readFile(file, "utf8");
const comics = parseComics(text);

const out: string[] = [
	"---",
	"title: 漫畫盤點",
	"description: LFO 官方漫畫書系列",
	"---",
	"",
	`《LFO》同名漫畫系列，共 ${comics.length} 卷，由 2005 年 7 月起每兩個月一卷。`,
	"",
];

for (const c of comics) {
	out.push(`### ${c.volume} ${c.title}`);
	const meta: string[] = [];
	if (c.price) meta.push(`**售價：** ${c.price}`);
	if (c.date) meta.push(`**發售：** ${c.date}`);
	if (meta.length) out.push(meta.join(" ・ "));
	out.push("");
	if (c.summary) out.push(c.summary, "");
}

await writeFile(file, out.join("\n"));
console.log(`Fixed comic.mdx: ${comics.length} volumes`);
