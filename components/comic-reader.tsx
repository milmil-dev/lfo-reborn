"use client";

import { useCallback, useEffect, useState } from "react";

interface ComicReaderProps {
	images: string[];
	title?: string;
}

export function ComicReader({ images, title }: ComicReaderProps) {
	const [currentPage, setCurrentPage] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);
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

				<img
					src={images[currentPage]}
					alt={`第 ${currentPage + 1} 頁`}
					className={`${isFullscreen ? "max-h-[calc(100vh-88px)]" : "max-h-[70vh]"} w-auto max-w-full object-contain`}
					draggable={false}
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
			</div>

			{/* Thumbnail strip */}
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
							className="h-12 w-16 object-cover"
							loading="lazy"
						/>
					</button>
				))}
			</div>
		</div>
	);

	if (isFullscreen) {
		return <div className="fixed inset-0 z-50">{readerContent}</div>;
	}

	return (
		<div className="mb-6 overflow-hidden rounded-lg border border-fd-border">{readerContent}</div>
	);
}
