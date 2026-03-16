"use client";

import { useEffect, useState } from "react";
import itemsData from "@/data/items.json";

interface Item {
	name: string;
	category: string;
	material?: string;
	effect?: string;
	durability?: string;
	price?: string;
	description?: string;
	consumption?: string;
	type?: string;
	stats?: Record<string, string>;
}

interface ItemCategory {
	category: string;
	items: Item[];
}

const _CATEGORY_MAP: Record<string, string> = {
	armor: "裝備",
	weapon: "武器",
	consumables: "消耗品",
	head: "摩摩星人",
	set: "套裝",
};

export function ItemsTable() {
	const [_category, setCategory] = useState<string | null>(null);
	const [items, setItems] = useState<Item[]>([]);

	useEffect(() => {
		const path = window.location.pathname;
		const match = path.match(/\/docs\/items\/([^/]+)$/);
		if (!match) return;

		const slug = match[1];
		const data = (itemsData as Record<string, ItemCategory>)[slug];
		if (data) {
			setCategory(data.category);
			setItems(data.items);
		}
	}, []);

	if (!items.length) return null;

	const hasStats = items.some((i) => i.stats && Object.keys(i.stats).length > 0);
	const hasMaterial = items.some((i) => i.material);
	const hasEffect = items.some((i) => i.effect);
	const hasDurability = items.some((i) => i.durability);
	const hasPrice = items.some((i) => i.price);

	return (
		<div className="mb-8 overflow-x-auto rounded-lg border border-fd-border">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-fd-border bg-fd-muted/50">
						<th className="p-3 text-left font-bold">名稱</th>
						{hasMaterial && <th className="p-3 text-left font-bold">成份</th>}
						{hasEffect && <th className="p-3 text-left font-bold">特效</th>}
						{hasDurability && <th className="p-3 text-left font-bold">耐久</th>}
						{hasPrice && <th className="p-3 text-left font-bold">價格</th>}
						{hasStats && (
							<>
								<th className="p-3 text-center font-bold">HP</th>
								<th className="p-3 text-center font-bold">MP</th>
								<th className="p-3 text-center font-bold">SP</th>
								<th className="p-3 text-center font-bold">STR</th>
								<th className="p-3 text-center font-bold">DEF</th>
								<th className="p-3 text-center font-bold">AGI</th>
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{items.map((item) => (
						<tr key={item.name} className="border-b border-fd-border/50 hover:bg-fd-muted/30">
							<td className="p-3 font-bold">{item.name}</td>
							{hasMaterial && (
								<td className="p-3 text-fd-muted-foreground">{item.material ?? ""}</td>
							)}
							{hasEffect && <td className="p-3">{item.effect ?? ""}</td>}
							{hasDurability && <td className="p-3 font-mono">{item.durability ?? ""}</td>}
							{hasPrice && <td className="p-3 font-mono">{item.price ?? ""}</td>}
							{hasStats && (
								<>
									<td className="p-3 text-center font-mono">{item.stats?.hp ?? ""}</td>
									<td className="p-3 text-center font-mono">{item.stats?.mp ?? ""}</td>
									<td className="p-3 text-center font-mono">{item.stats?.sp ?? ""}</td>
									<td className="p-3 text-center font-mono">{item.stats?.str ?? ""}</td>
									<td className="p-3 text-center font-mono">{item.stats?.def ?? ""}</td>
									<td className="p-3 text-center font-mono">{item.stats?.agi ?? ""}</td>
								</>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function ItemsIndex() {
	const categories = Object.entries(itemsData as Record<string, ItemCategory>).filter(
		([, v]) => v.items.length > 0,
	);

	return (
		<div className="space-y-4">
			{categories.map(([key, data]) => (
				<div key={key} className="rounded-lg border border-fd-border p-4">
					<h3 className="mb-2 text-lg font-bold">{data.category}</h3>
					<p className="text-sm text-fd-muted-foreground">{data.items.length} 件道具</p>
					<a
						href={`/docs/items/${key}`}
						className="mt-2 inline-block text-sm text-fd-primary hover:underline"
					>
						查看全部 →
					</a>
				</div>
			))}
		</div>
	);
}
