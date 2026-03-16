"use client";

import { useCallback, useEffect, useState } from "react";

interface ComicReaderProps {
	images: string[];
	title?: string;
	storyId?: string;
}

export function ComicReader({ images, title, storyId }: ComicReaderProps) {
	const [currentPage, setCurrentPage] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showThumbnails, setShowThumbnails] = useState(true);
	const [imageLoading, setImageLoading] = useState(true);
	const [showHint, setShowHint] = useState(() => {
		if (typeof window === "undefined") return false;
		return !sessionStorage.getItem("lfo-reader-hint-seen");
	});
	const [resumePrompt, setResumePrompt] = useState<number | null>(null);
	const total = images.length;

	const goNext = useCallback(() => {
		setCurrentPage((p) => Math.min(p + 1, total - 1));
	}, [total]);

	const goPrev = useCallback(() => {
		setCurrentPage((p) => Math.max(p - 1, 0));
	}, []);

	const goFirst = useCallback(() => setCurrentPage(0), []);
	const goLast = useCallback(() => setCurrentPage(total - 1), [total]);

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
				e.preventDefault();
				goNext();
			} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
				e.preventDefault();
				goPrev();
			} else if (e.key === "Home") {
				e.preventDefault();
				goFirst();
			} else if (e.key === "End") {
				e.preventDefault();
				goLast();
			} else if (e.key === "Escape" && isFullscreen) {
				setIsFullscreen(false);
			} else if (e.key === "f" || e.key === "F") {
				setIsFullscreen((v) => !v);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [goNext, goPrev, goFirst, goLast, isFullscreen]);

	// Reset image loading state on page change
	// biome-ignore lint/correctness/useExhaustiveDependencies: currentPage is the trigger, not used in body
	useEffect(() => {
		setImageLoading(true);
	}, [currentPage]);

	// Auto-dismiss keyboard hint
	useEffect(() => {
		if (!showHint) return;
		const timer = setTimeout(() => {
			setShowHint(false);
			sessionStorage.setItem("lfo-reader-hint-seen", "1");
		}, 3000);
		const dismiss = () => {
			setShowHint(false);
			sessionStorage.setItem("lfo-reader-hint-seen", "1");
		};
		window.addEventListener("keydown", dismiss, { once: true });
		window.addEventListener("click", dismiss, { once: true });
		return () => {
			clearTimeout(timer);
			window.removeEventListener("keydown", dismiss);
			window.removeEventListener("click", dismiss);
		};
	}, [showHint]);

	// Check localStorage for saved progress on mount
	useEffect(() => {
		if (!storyId) return;
		const saved = localStorage.getItem(`lfo-reader-${storyId}`);
		if (saved) {
			const page = Number(saved);
			if (page > 0 && page < total) {
				setResumePrompt(page);
			}
		}
	}, [storyId, total]);

	// Save progress to localStorage
	useEffect(() => {
		if (!storyId || currentPage === 0) return;
		localStorage.setItem(`lfo-reader-${storyId}`, String(currentPage));
	}, [storyId, currentPage]);

	if (!images.length) return null;

	const readerContent = (
		<div className={`flex flex-col ${isFullscreen ? "h-screen bg-black" : ""}`}>
			{/* Top bar */}
			<div className="flex items-center justify-between bg-black/90 px-4 py-2 text-white">
				<div className="flex items-center gap-2">
					{title && <span className="text-sm font-bold">{title}</span>}
					<span className="text-xs text-white/60">
						{currentPage + 1} / {total}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setIsFullscreen((v) => !v)}
						className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
					>
						{isFullscreen ? "退出全屏" : "全屏閱讀"}
					</button>
				</div>
			</div>

			{/* Image area */}
			{/* biome-ignore lint/a11y/useSemanticElements: click zones split left/right for prev/next navigation */}
			<div
				role="button"
				tabIndex={0}
				className={`relative flex flex-1 items-center justify-center bg-black ${isFullscreen ? "cursor-pointer" : "cursor-pointer"}`}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						goNext();
					}
				}}
				onClick={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const x = e.clientX - rect.left;
					if (x > rect.width / 2) {
						goNext();
					} else {
						goPrev();
					}
				}}
			>
				{/* Preload adjacent images */}
				{currentPage > 0 && <link rel="prefetch" href={images[currentPage - 1]} />}
				{currentPage < total - 1 && <link rel="prefetch" href={images[currentPage + 1]} />}

				{imageLoading && (
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
					</div>
				)}

				<img
					src={images[currentPage]}
					alt={`第 ${currentPage + 1} 頁`}
					className={`${isFullscreen ? "max-h-[calc(100vh-88px)]" : "max-h-[85vh]"} w-auto max-w-full object-contain transition-opacity ${imageLoading ? "opacity-0" : "opacity-100"}`}
					draggable={false}
					onLoad={() => setImageLoading(false)}
					onError={() => setImageLoading(false)}
				/>

				{/* Left/right click zones visual hint */}
				{currentPage > 0 && (
					<div className="absolute inset-y-0 left-0 flex w-16 items-center justify-center opacity-0 transition-opacity hover:opacity-100">
						<div className="rounded-full bg-white/20 p-2">
							<svg
								className="h-6 w-6 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>上一頁</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
						</div>
					</div>
				)}
				{currentPage < total - 1 && (
					<div className="absolute inset-y-0 right-0 flex w-16 items-center justify-center opacity-0 transition-opacity hover:opacity-100">
						<div className="rounded-full bg-white/20 p-2">
							<svg
								className="h-6 w-6 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>下一頁</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</div>
					</div>
				)}

				{showHint && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						<div className="rounded-xl bg-black/70 px-6 py-4 text-center text-sm text-white/90 backdrop-blur-sm">
							<p>← → 翻頁 · F 全屏 · Home/End 首末頁</p>
							<p className="mt-1 text-xs text-white/50">點擊圖片左右區域也可翻頁</p>
						</div>
					</div>
				)}

				{resumePrompt !== null && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
						<div className="rounded-xl bg-fd-card border border-fd-border px-6 py-4 text-center shadow-xl">
							<p className="text-sm text-fd-foreground">繼續閱讀第 {resumePrompt + 1} 頁？</p>
							<div className="mt-3 flex justify-center gap-3">
								<button
									type="button"
									onClick={() => {
										setCurrentPage(resumePrompt);
										setResumePrompt(null);
									}}
									className="rounded-lg bg-fd-primary px-4 py-1.5 text-sm font-medium text-white"
								>
									繼續
								</button>
								<button
									type="button"
									onClick={() => setResumePrompt(null)}
									className="rounded-lg border border-fd-border px-4 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-muted/50"
								>
									從頭開始
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Bottom controls */}
			<div className="flex items-center justify-center gap-2 bg-black/90 px-4 py-2">
				<button
					type="button"
					onClick={goFirst}
					disabled={currentPage === 0}
					className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
				>
					⏮
				</button>
				<button
					type="button"
					onClick={goPrev}
					disabled={currentPage === 0}
					className="rounded px-3 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
				>
					← 上一頁
				</button>

				{/* Page slider */}
				<input
					type="range"
					min={0}
					max={total - 1}
					value={currentPage}
					onChange={(e) => setCurrentPage(Number(e.target.value))}
					className="mx-2 h-1 w-32 cursor-pointer appearance-none rounded-full bg-white/20 accent-white sm:w-48"
				/>

				<button
					type="button"
					onClick={goNext}
					disabled={currentPage === total - 1}
					className="rounded px-3 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
				>
					下一頁 →
				</button>
				<button
					type="button"
					onClick={goLast}
					disabled={currentPage === total - 1}
					className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
				>
					⏭
				</button>
				<button
					type="button"
					onClick={() => setShowThumbnails((v) => !v)}
					className="ml-2 rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
					title={showThumbnails ? "隱藏縮圖" : "顯示縮圖"}
				>
					{showThumbnails ? "▼" : "▲"}
				</button>
			</div>

			{/* Thumbnail strip */}
			{showThumbnails && (
				<div className="flex gap-1 overflow-x-auto bg-black/95 px-2 py-2">
					{images.map((img, i) => (
						<button
							type="button"
							key={img}
							onClick={() => setCurrentPage(i)}
							className={`shrink-0 overflow-hidden rounded border-2 transition-all ${
								i === currentPage
									? "border-white opacity-100"
									: "border-transparent opacity-40 hover:opacity-70"
							}`}
						>
							<img
								src={img}
								alt={`縮圖 ${i + 1}`}
								className="h-16 w-24 object-cover"
								loading="lazy"
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);

	if (isFullscreen) {
		return <div className="fixed inset-0 z-50">{readerContent}</div>;
	}

	return (
		<div className="mb-6 overflow-hidden rounded-lg border border-fd-border">{readerContent}</div>
	);
}
