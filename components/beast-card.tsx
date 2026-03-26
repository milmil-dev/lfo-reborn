"use client";

import { useEffect, useState } from "react";
import beastsData from "@/data/beasts.json";

const STAT_KEYS = ["HP", "MP", "SP", "STR", "DEF", "AGI"] as const;

interface BeastData {
	slug: string;
	name: string;
	normalStats?: Record<string, { base: string; growth: string }>;
	enhancedStats?: Record<string, { base: string; growth: string }>;
	skills?: { name?: string; command?: string; cost?: string }[];
	images?: string[];
}

export function BeastCard({ path }: { path: string }) {
	const [data, setData] = useState<BeastData | null>(null);

	useEffect(() => {
		const slug = path.match(/\/docs\/beast\/([^/]+)$/)?.[1];
		if (!slug) return;
		const beast = (beastsData as Record<string, BeastData>)[slug];
		if (!beast) return;
		setData(beast);
	}, [path]);

	if (!data) return null;

	return (
		<div className="mb-8 space-y-4">
			{/* Stats */}
			{(data.normalStats || data.enhancedStats) && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{data.normalStats && <StatsTable title="普通版起初能力" stats={data.normalStats} />}
					{data.enhancedStats && <StatsTable title="強化版起初能力" stats={data.enhancedStats} />}
				</div>
			)}

			{/* Beast Images */}
			{data.images && data.images.length > 0 && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
					{data.images.map((url, i) => (
						<img
							key={url}
							src={url}
							alt={`${data.name} ${i + 1}`}
							className="rounded-lg border border-fd-border object-contain"
							loading="lazy"
						/>
					))}
				</div>
			)}

			{/* Skills */}
			{data.skills && data.skills.length > 0 && (
				<div className="overflow-x-auto rounded-lg border border-fd-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-fd-border bg-fd-muted/50">
								<th className="p-3 text-left font-bold">技能</th>
								<th className="p-3 text-left font-bold">出招方法</th>
								<th className="p-3 text-left font-bold">消耗能力</th>
							</tr>
						</thead>
						<tbody>
							{data.skills.map((skill, i) => (
								<tr key={`${skill.name}-${skill.command}`} className="border-b border-fd-border/50">
									<td className="p-3 font-bold">{skill.name ?? `技能${i + 1}`}</td>
									<td className="p-3 font-mono text-xs">{skill.command ?? "--"}</td>
									<td className="p-3">{skill.cost ?? "--"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function StatsTable({
	title,
	stats,
}: {
	title: string;
	stats: Record<string, { base: string; growth: string }>;
}) {
	return (
		<div className="rounded-lg border border-fd-border">
			<h4 className="border-b border-fd-border bg-fd-muted/50 p-3 text-sm font-bold">{title}</h4>
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-fd-border/50">
						<th className="p-2 text-left">能力</th>
						<th className="p-2 text-right">能力值</th>
						<th className="p-2 text-right">每加1點的效果</th>
					</tr>
				</thead>
				<tbody>
					{STAT_KEYS.map((key) => {
						const s = stats[key.toLowerCase()];
						return (
							<tr key={key} className="border-b border-fd-border/30">
								<td className="p-2 font-bold">{key}</td>
								<td className="p-2 text-right font-mono">{s?.base ?? "--"}</td>
								<td className="p-2 text-right font-mono">{s?.growth ?? "--"}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
