"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Virtual } from "swiper/modules";
import type { SwiperClass } from "swiper/react";
import { Swiper, SwiperSlide } from "swiper/react";
import { updateSettings, useSettings } from "@/lib/settings-store";
import "swiper/css";

interface ComicReaderProps {
	images: string[];
	title?: string;
	storyId?: string;
}

export function ComicReader({ images, title, storyId }: ComicReaderProps) {
	const { readerMode } = useSettings();
	const [currentPage, setCurrentPage] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showThumbnails, setShowThumbnails] = useState(true);
	const [showHint, setShowHint] = useState(() => {
		if (typeof window === "undefined") return false;
		return !sessionStorage.getItem("lfo-reader-hint-seen");
	});
	const [resumePrompt, setResumePrompt] = useState<number | null>(null);
	const swiperRef = useRef<SwiperClass | null>(null);
	const thumbStripRef = useRef<HTMLDivElement | null>(null);
	const total = images.length;

	const goTo = useCallback(
		(page: number) => {
			const clamped = Math.max(0, Math.min(page, total - 1));
			swiperRef.current?.slideTo(clamped);
		},
		[total],
	);
	const goNext = useCallback(() => swiperRef.current?.slideNext(), []);
	const goPrev = useCallback(() => swiperRef.current?.slidePrev(), []);
	const goFirst = useCallback(() => swiperRef.current?.slideTo(0), []);
	const goLast = useCallback(() => swiperRef.current?.slideTo(total - 1), [total]);

	// Keyboard navigation (F for fullscreen, Home/End)
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Home") {
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
	}, [goFirst, goLast, isFullscreen]);

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

	// Auto-scroll thumbnail strip to active page
	useEffect(() => {
		const strip = thumbStripRef.current;
		if (!strip || !showThumbnails) return;
		const activeThumb = strip.querySelector(`[data-page="${currentPage}"]`) as HTMLElement | null;
		if (!activeThumb) return;
		activeThumb.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
	}, [currentPage, showThumbnails]);

	if (!images.length) return null;

	const progressPercent = total > 1 ? (currentPage / (total - 1)) * 100 : 0;

	const readerContent = (
		<div className={`flex flex-col ${isFullscreen ? "h-screen bg-black" : ""}`}>
			{/* Swiper image area */}
			<div className="group/reader relative flex-1 bg-black">
				<Swiper
					modules={[Keyboard, Virtual]}
					keyboard={{ enabled: true }}
					virtual={{
						enabled: true,
						addSlidesAfter: 2,
						addSlidesBefore: 2,
					}}
					speed={280}
					spaceBetween={0}
					slidesPerView={1}
					onSwiper={(swiper) => {
						swiperRef.current = swiper;
					}}
					onSlideChange={(swiper) => {
						setCurrentPage(swiper.activeIndex);
					}}
					className={isFullscreen ? "h-[calc(100vh-56px)]" : "h-[60vh]"}
				>
					{images.map((img, i) => (
						<SwiperSlide key={img} virtualIndex={i}>
							<div className="flex h-full items-center justify-center">
								<img
									src={img}
									alt={`第 ${i + 1} 頁`}
									className="max-h-full w-auto max-w-full object-contain"
									draggable={false}
									loading={Math.abs(i - currentPage) <= 2 ? "eager" : "lazy"}
								/>
							</div>
						</SwiperSlide>
					))}
				</Swiper>

				{/* Floating page indicator — top-left */}
				<div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
					<span className="rounded-md bg-black/60 px-2.5 py-1 text-xs font-medium tabular-nums text-white/90 backdrop-blur-sm">
						{currentPage + 1} / {total}
					</span>
				</div>

				{/* Left nav zone */}
				{currentPage > 0 && (
					<button
						type="button"
						onClick={goPrev}
						className="absolute inset-y-0 left-0 z-10 flex w-20 items-center justify-center opacity-0 transition-opacity duration-200 group-hover/reader:opacity-100"
					>
						<div className="rounded-full bg-black/40 p-2.5 backdrop-blur-sm">
							<svg
								className="h-5 w-5 text-white"
								fill="none"
								stroke="currentColor"
								strokeWidth={2.5}
								viewBox="0 0 24 24"
							>
								<title>上一頁</title>
								<path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
							</svg>
						</div>
					</button>
				)}
				{/* Right nav zone */}
				{currentPage < total - 1 && (
					<button
						type="button"
						onClick={goNext}
						className="absolute inset-y-0 right-0 z-10 flex w-20 items-center justify-center opacity-0 transition-opacity duration-200 group-hover/reader:opacity-100"
					>
						<div className="rounded-full bg-black/40 p-2.5 backdrop-blur-sm">
							<svg
								className="h-5 w-5 text-white"
								fill="none"
								stroke="currentColor"
								strokeWidth={2.5}
								viewBox="0 0 24 24"
							>
								<title>下一頁</title>
								<path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
							</svg>
						</div>
					</button>
				)}

				{/* Keyboard hint */}
				{showHint && (
					<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
						<div className="rounded-xl bg-black/70 px-6 py-4 text-center text-sm text-white/90 backdrop-blur-md">
							<p className="font-medium">← → 翻頁 · F 全屏 · Home/End 首末頁</p>
							<p className="mt-1 text-xs text-white/50">滑動或點擊左右區域翻頁</p>
						</div>
					</div>
				)}

				{/* Resume prompt */}
				{resumePrompt !== null && (
					<div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
						<div className="rounded-2xl border border-fd-border bg-fd-card/95 px-8 py-6 text-center shadow-2xl backdrop-blur-md">
							<p className="text-sm font-medium text-fd-foreground">
								繼續閱讀第 {resumePrompt + 1} 頁？
							</p>
							<div className="mt-4 flex justify-center gap-3">
								<button
									type="button"
									onClick={() => {
										goTo(resumePrompt);
										setResumePrompt(null);
									}}
									className="rounded-lg bg-fd-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-fd-primary/90"
								>
									繼續
								</button>
								<button
									type="button"
									onClick={() => setResumePrompt(null)}
									className="rounded-lg border border-fd-border px-5 py-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-muted/50"
								>
									從頭開始
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Bottom controls — minimal, icon-based */}
			<div className="flex items-center gap-1 bg-black px-3 py-2">
				{/* Left: nav buttons */}
				<div className="flex items-center gap-0.5">
					<button
						type="button"
						onClick={goFirst}
						disabled={currentPage === 0}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.5}
							viewBox="0 0 24 24"
						>
							<title>第一頁</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
							/>
						</svg>
					</button>
					<button
						type="button"
						onClick={goPrev}
						disabled={currentPage === 0}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.5}
							viewBox="0 0 24 24"
						>
							<title>上一頁</title>
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
						</svg>
					</button>
				</div>

				{/* Center: slider + page count */}
				<div className="flex flex-1 items-center gap-3 px-2">
					<div className="group/slider relative flex-1 py-1">
						<div className="h-1 rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-fd-primary transition-all duration-150"
								style={{ width: `${progressPercent}%` }}
							/>
						</div>
						<input
							type="range"
							min={0}
							max={total - 1}
							value={currentPage}
							onChange={(e) => goTo(Number(e.target.value))}
							className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							style={{ appearance: "none", WebkitAppearance: "none" }}
						/>
						{/* Custom thumb indicator */}
						<div
							className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fd-primary shadow-sm shadow-fd-primary/50 transition-all duration-150"
							style={{ left: `${progressPercent}%` }}
						/>
					</div>
					<span className="shrink-0 text-xs tabular-nums text-white/40">
						{currentPage + 1} / {total}
					</span>
				</div>

				{/* Right: nav + actions */}
				<div className="flex items-center gap-0.5">
					<button
						type="button"
						onClick={goNext}
						disabled={currentPage === total - 1}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.5}
							viewBox="0 0 24 24"
						>
							<title>下一頁</title>
							<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
						</svg>
					</button>
					<button
						type="button"
						onClick={goLast}
						disabled={currentPage === total - 1}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.5}
							viewBox="0 0 24 24"
						>
							<title>最後一頁</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5"
							/>
						</svg>
					</button>
					<div className="mx-1 h-4 w-px bg-white/10" />
					{/* Reader mode toggle */}
					<button
						type="button"
						onClick={() =>
							updateSettings({ readerMode: readerMode === "slide" ? "scroll" : "slide" })
						}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
						title={readerMode === "slide" ? "切換至垂直捲動" : "切換至左右滑動"}
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<title>閱讀模式</title>
							{readerMode === "slide" ? (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
								/>
							) : (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
								/>
							)}
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setShowThumbnails((v) => !v)}
						className={`rounded-md p-1.5 transition-colors hover:bg-white/10 ${showThumbnails ? "text-fd-primary" : "text-white/50 hover:text-white"}`}
						title={showThumbnails ? "隱藏縮圖" : "顯示縮圖"}
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<title>縮圖</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zm9.75-9.75A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zm0 9.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z"
							/>
						</svg>
					</button>
					<button
						type="button"
						onClick={() => setIsFullscreen((v) => !v)}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<title>{isFullscreen ? "退出全屏" : "全屏閱讀"}</title>
							{isFullscreen ? (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
								/>
							) : (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
								/>
							)}
						</svg>
					</button>
				</div>
			</div>

			{/* Thumbnail strip */}
			{showThumbnails && (
				<div
					ref={thumbStripRef}
					className="flex gap-1 overflow-x-auto bg-black px-2 py-1.5 scroll-smooth"
				>
					{images.map((img, i) => (
						<button
							type="button"
							key={img}
							data-page={i}
							onClick={() => goTo(i)}
							className={`group/thumb shrink-0 overflow-hidden rounded-md border-2 transition-all duration-200 ${
								i === currentPage
									? "border-fd-primary opacity-100 scale-105"
									: "border-transparent opacity-40 hover:opacity-80 hover:border-white/30 hover:scale-[1.02]"
							}`}
						>
							<img
								src={img}
								alt={`縮圖 ${i + 1}`}
								className={`h-12 w-[72px] object-cover transition-all duration-200 ${
									i === currentPage
										? "brightness-110"
										: "group-hover/thumb:brightness-100 brightness-75"
								}`}
								loading="lazy"
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);

	if (readerMode === "scroll") {
		return <ScrollReader images={images} title={title} storyId={storyId} />;
	}

	if (isFullscreen) {
		return <div className="fixed inset-0 z-50">{readerContent}</div>;
	}

	return (
		<div className="mb-6 overflow-hidden rounded-xl shadow-2xl shadow-black/50">
			{readerContent}
		</div>
	);
}

/* ─────────────────────────────────────────────
   ScrollReader — vertical manga reader with
   thumbnail sidebar on the right
   ───────────────────────────────────────────── */

function ScrollReader({
	images,
	title,
	storyId,
}: {
	images: string[];
	title?: string;
	storyId?: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const thumbListRef = useRef<HTMLDivElement>(null);
	const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
	const [visiblePage, setVisiblePage] = useState(0);
	const [scrollPercent, setScrollPercent] = useState(0);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const total = images.length;

	// Track which page is in view
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observers: IntersectionObserver[] = [];
		for (let i = 0; i < imageRefs.current.length; i++) {
			const el = imageRefs.current[i];
			if (!el) continue;
			const obs = new IntersectionObserver(
				(entries) => {
					if (entries[0]?.isIntersecting) setVisiblePage(i);
				},
				{ root: container, threshold: 0.3 },
			);
			obs.observe(el);
			observers.push(obs);
		}
		return () => {
			for (const obs of observers) obs.disconnect();
		};
	}, []);

	// Track scroll progress
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			setScrollPercent(
				scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0,
			);
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		return () => container.removeEventListener("scroll", onScroll);
	}, []);

	// Auto-scroll thumbnail list to track visible page
	useEffect(() => {
		const list = thumbListRef.current;
		if (!list) return;
		const activeThumb = list.querySelector(`[data-idx="${visiblePage}"]`) as HTMLElement | null;
		if (!activeThumb) return;
		list.scrollTo({
			top: activeThumb.offsetTop - list.clientHeight / 2 + activeThumb.offsetHeight / 2,
			behavior: "smooth",
		});
	}, [visiblePage]);

	// Save progress
	useEffect(() => {
		if (!storyId || visiblePage === 0) return;
		localStorage.setItem(`lfo-reader-${storyId}`, String(visiblePage));
	}, [storyId, visiblePage]);

	// Restore progress
	useEffect(() => {
		if (!storyId) return;
		const saved = localStorage.getItem(`lfo-reader-${storyId}`);
		if (saved) {
			const page = Number(saved);
			if (page > 0 && page < total) {
				setTimeout(() => {
					imageRefs.current[page]?.scrollIntoView({ behavior: "smooth" });
				}, 300);
			}
		}
	}, [storyId, total]);

	const scrollToPage = (i: number) => {
		imageRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	const { readerMode } = useSettings();

	const content = (
		<div className={`flex flex-col overflow-hidden bg-black ${isFullscreen ? "h-screen" : ""}`}>
			{/* Top bar: progress + page counter */}
			<div className="relative flex items-center bg-black px-3 py-1.5">
				<span className="text-xs font-medium tabular-nums text-white/80">
					{visiblePage + 1} / {total}
				</span>
				{title && <span className="ml-3 truncate text-xs text-white/40">{title}</span>}
				{/* Progress bar */}
				<div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
					<div
						className="h-full bg-fd-primary transition-all duration-100"
						style={{ width: `${scrollPercent}%` }}
					/>
				</div>
			</div>

			{/* Main area: scrollable images + thumbnail sidebar */}
			<div className={`flex ${isFullscreen ? "flex-1" : "h-[60vh]"}`}>
				{/* Scrollable image area */}
				<div ref={containerRef} className="flex-1 overflow-y-auto scroll-smooth">
					{images.map((img, i) => (
						<div
							key={img}
							ref={(el) => {
								imageRefs.current[i] = el;
							}}
							className="flex justify-center bg-black"
						>
							<img
								src={img}
								alt={`第 ${i + 1} 頁`}
								className="w-full max-w-[800px]"
								loading={i <= 5 ? "eager" : "lazy"}
								draggable={false}
							/>
						</div>
					))}
					<div className="flex items-center justify-center bg-black py-6">
						<span className="text-xs text-white/20">— 完 —</span>
					</div>
				</div>

				{/* Right thumbnail sidebar */}
				<div
					ref={thumbListRef}
					className="hidden w-20 flex-shrink-0 overflow-y-auto border-l border-white/5 bg-black/80 sm:block"
				>
					{images.map((img, i) => (
						<button
							type="button"
							key={img}
							data-idx={i}
							onClick={() => scrollToPage(i)}
							className={`relative w-full border-l-2 transition-all duration-150 ${
								i === visiblePage
									? "border-l-fd-primary bg-white/5"
									: "border-l-transparent opacity-40 hover:opacity-70 hover:bg-white/5"
							}`}
						>
							<img
								src={img}
								alt={`${i + 1}`}
								className="aspect-[4/3] w-full object-cover"
								loading="lazy"
							/>
							<span
								className={`absolute bottom-0.5 right-1 text-[9px] tabular-nums ${
									i === visiblePage ? "font-bold text-fd-primary" : "text-white/40"
								}`}
							>
								{i + 1}
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Bottom controls */}
			<div className="flex items-center gap-1 bg-black px-3 py-2">
				{/* Left: page info + slider */}
				<div className="flex flex-1 items-center gap-3 px-2">
					<div className="group/slider relative flex-1 py-1">
						<div className="h-1 rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-fd-primary transition-all duration-150"
								style={{ width: `${scrollPercent}%` }}
							/>
						</div>
					</div>
					<span className="shrink-0 text-xs tabular-nums text-white/40">
						{visiblePage + 1} / {total}
					</span>
				</div>

				{/* Right: actions */}
				<div className="flex items-center gap-0.5">
					<div className="mx-1 h-4 w-px bg-white/10" />
					{/* Reader mode toggle */}
					<button
						type="button"
						onClick={() =>
							updateSettings({ readerMode: readerMode === "slide" ? "scroll" : "slide" })
						}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
						title={readerMode === "slide" ? "切換至垂直捲動" : "切換至左右滑動"}
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<title>閱讀模式</title>
							{readerMode === "slide" ? (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
								/>
							) : (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
								/>
							)}
						</svg>
					</button>
					{/* Fullscreen toggle */}
					<button
						type="button"
						onClick={() => setIsFullscreen((v) => !v)}
						className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							viewBox="0 0 24 24"
						>
							<title>{isFullscreen ? "退出全屏" : "全屏閱讀"}</title>
							{isFullscreen ? (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
								/>
							) : (
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
								/>
							)}
						</svg>
					</button>
				</div>
			</div>
		</div>
	);

	if (isFullscreen) {
		return <div className="fixed inset-0 z-50">{content}</div>;
	}

	return (
		<div className="mb-6 overflow-hidden rounded-xl shadow-2xl shadow-black/50">{content}</div>
	);
}
