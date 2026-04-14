#!/usr/bin/env bun
/**
 * good/news*.mdx pages have product entries mashed into table cells with
 * duplicates and leading empty bullet lists. Rebuild as clean product sections.
 */

import { readFile, writeFile } from "node:fs/promises";

interface Product {
	name: string;
	price: string;
	date: string;
	summary: string;
	raw: string;
}

function parseProducts(body: string): Product[] {
	const products = new Map<string, Product>();
	const lines = body.split("\n");

	for (const line of lines) {
		if (!line.startsWith("|")) continue;
		const cells = line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());

		for (const cell of cells) {
			if (!cell.includes("產品名稱：")) continue;

			// Extract fields
			const nameMatch = cell.match(
				/產品名稱：([^\s]+(?:\s+[^\s售發本每]+)*?)(?=\s+(?:售價|發售|本產品|每組|每包))/,
			);
			const priceMatch = cell.match(/售價：([^\s]+(?:\/包)?)/);
			const dateMatch = cell.match(/發售日期：(\d{4}年\d{1,2}月\d{1,2}日)/);
			const summaryMatch = cell.match(
				/內容簡介：\s*([^本產每]+?)(?=\s*本產品內附|\s*每組|\s*每包|$)/,
			);

			const name = nameMatch?.[1]?.trim() ?? "";
			if (!name || products.has(name)) continue;

			products.set(name, {
				name,
				price: priceMatch?.[1] ?? "",
				date: dateMatch?.[1] ?? "",
				summary: summaryMatch?.[1]?.trim().replace(/\s+/g, " ") ?? "",
				raw: cell.replace(/\s+/g, " ").trim(),
			});
		}
	}

	return Array.from(products.values());
}

function renderProducts(products: Product[], title: string, pageNum: number): string {
	const header = `---\ntitle: ${title}\ndescription: 產品資訊 - ${title}（第${pageNum}頁）\n---\n\n`;
	const parts: string[] = [header];
	parts.push(`LFO 歷代推出的產品共 ${products.length} 項。\n\n`);

	for (const p of products) {
		parts.push(`### ${p.name}\n`);
		const meta: string[] = [];
		if (p.price) meta.push(`**售價：** ${p.price}`);
		if (p.date) meta.push(`**發售日期：** ${p.date}`);
		if (meta.length) parts.push(`${meta.join(" ・ ")}\n`);
		if (p.summary) parts.push(`\n${p.summary}\n`);
		parts.push(`\n<details>\n<summary>完整資料</summary>\n\n${p.raw}\n\n</details>\n\n`);
	}

	return parts.join("");
}

const PAGES = [
	{ file: "content/docs/good/news.mdx", title: "產品盤點（第1頁）", num: 1 },
	{ file: "content/docs/good/news2.mdx", title: "產品盤點（第2頁）", num: 2 },
	{ file: "content/docs/good/news3.mdx", title: "產品盤點（第3頁）", num: 3 },
];

for (const { file, title, num } of PAGES) {
	const text = await readFile(file, "utf8");
	const products = parseProducts(text);
	if (products.length === 0) {
		console.log(`  SKIP ${file}: no products found`);
		continue;
	}
	const newText = renderProducts(products, title, num);
	await writeFile(file, newText);
	console.log(`  FIXED ${file}: ${products.length} products`);
}
