"use client";

import { useEffect, useState } from "react";
import { updateSettings, useSettings } from "@/lib/settings-store";

export function SettingsButton() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-muted/50 hover:text-fd-foreground"
				title="設定"
			>
				<svg
					className="h-4 w-4"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					viewBox="0 0 24 24"
				>
					<title>設定</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
					/>
					<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</button>
			{open && <SettingsDialog onClose={() => setOpen(false)} />}
		</>
	);
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
	const settings = useSettings();
	const [visible, setVisible] = useState(false);
	const [closing, setClosing] = useState(false);

	// Animate in on mount
	useEffect(() => {
		requestAnimationFrame(() => setVisible(true));
	}, []);

	const handleClose = () => {
		setClosing(true);
		setVisible(false);
		setTimeout(onClose, 200);
	};

	return (
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
				visible && !closing ? "bg-black/50 backdrop-blur-sm" : "bg-black/0 backdrop-blur-none"
			}`}
			onClick={handleClose}
		>
			<div
				className={`mx-4 w-full max-w-sm rounded-2xl border border-fd-border bg-fd-card p-6 shadow-2xl transition-all duration-200 ${
					visible && !closing
						? "scale-100 opacity-100 translate-y-0"
						: "scale-95 opacity-0 translate-y-2"
				}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-bold text-fd-foreground">設定</h2>
					<button
						type="button"
						onClick={handleClose}
						className="rounded-md p-1 text-fd-muted-foreground transition-colors hover:bg-fd-muted/50 hover:text-fd-foreground"
					>
						<svg
							className="h-5 w-5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<title>關閉</title>
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div className="mt-5 space-y-5">
					{/* Music Player Toggle */}
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium text-fd-foreground">音樂播放器</p>
							<p className="text-xs text-fd-muted-foreground">顯示浮動音樂播放器</p>
						</div>
						<button
							type="button"
							onClick={() => updateSettings({ musicPlayerEnabled: !settings.musicPlayerEnabled })}
							className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
								settings.musicPlayerEnabled ? "bg-fd-primary" : "bg-fd-muted"
							}`}
						>
							<span
								className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
									settings.musicPlayerEnabled ? "translate-x-5" : "translate-x-0"
								}`}
							/>
						</button>
					</div>
				</div>

				<div className="mt-6 flex justify-end">
					<button
						type="button"
						onClick={handleClose}
						className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fd-primary/90"
					>
						完成
					</button>
				</div>
			</div>
		</div>
	);
}
