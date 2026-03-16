"use client";

import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface LightboxImage {
	src: string;
	alt?: string;
}

interface LightboxState {
	images: LightboxImage[];
	index: number;
}

let openLightbox: ((state: LightboxState) => void) | null = null;

/**
 * Open the global image lightbox.
 * Pass a single image or an array with a starting index.
 */
export function showLightbox(images: LightboxImage | LightboxImage[], index = 0) {
	const arr = Array.isArray(images) ? images : [images];
	openLightbox?.({ images: arr, index });
}

/**
 * Mount this once in _root or layout. Provides a global lightbox overlay.
 */
export function ImageLightbox() {
	const [state, setState] = useState<LightboxState | null>(null);
	const [zoom, setZoom] = useState(1.2);
	const [rotation, setRotation] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// Panning
	const panX = useMotionValue(0);
	const panY = useMotionValue(0);
	const isDragging = useRef(false);
	const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

	// Register global opener
	useEffect(() => {
		openLightbox = (s) => {
			setState(s);
			setZoom(1);
			setRotation(0);
			panX.set(0);
			panY.set(0);
		};
		return () => {
			openLightbox = null;
		};
	}, [panX, panY]);

	const close = useCallback(() => {
		setState(null);
		setZoom(1);
		setRotation(0);
		panX.set(0);
		panY.set(0);
	}, [panX, panY]);

	const goNext = useCallback(() => {
		if (!state || state.images.length <= 1) return;
		setState((s) => s && { ...s, index: (s.index + 1) % s.images.length });
		setZoom(1);
		setRotation(0);
		panX.set(0);
		panY.set(0);
	}, [state, panX, panY]);

	const goPrev = useCallback(() => {
		if (!state || state.images.length <= 1) return;
		setState((s) => s && { ...s, index: (s.index - 1 + s.images.length) % s.images.length });
		setZoom(1);
		setRotation(0);
		panX.set(0);
		panY.set(0);
	}, [state, panX, panY]);

	const zoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.5, 8)), []);
	const zoomOut = useCallback(() => {
		setZoom((z) => {
			const next = Math.max(z / 1.5, 1);
			if (next === 1) {
				panX.set(0);
				panY.set(0);
			}
			return next;
		});
	}, [panX, panY]);
	const resetView = useCallback(() => {
		setZoom(1.2);
		setRotation(0);
		panX.set(0);
		panY.set(0);
	}, [panX, panY]);
	const rotate = useCallback(() => setRotation((r) => r + 90), []);

	// Keyboard shortcuts
	useEffect(() => {
		if (!state) return;

		const handler = (e: KeyboardEvent) => {
			switch (e.key) {
				case "Escape":
					close();
					break;
				case "ArrowRight":
				case "d":
					goNext();
					break;
				case "ArrowLeft":
				case "a":
					goPrev();
					break;
				case "+":
				case "=":
					e.preventDefault();
					zoomIn();
					break;
				case "-":
					e.preventDefault();
					zoomOut();
					break;
				case "0":
					resetView();
					break;
				case "r":
					rotate();
					break;
			}
		};

		document.addEventListener("keydown", handler);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handler);
			document.body.style.overflow = "";
		};
	}, [state, close, goNext, goPrev, zoomIn, zoomOut, resetView, rotate]);

	// Mouse wheel zoom
	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			e.preventDefault();
			if (e.deltaY < 0) zoomIn();
			else zoomOut();
		},
		[zoomIn, zoomOut],
	);

	// Pan via mouse drag (when zoomed)
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (zoom <= 1) return;
			isDragging.current = true;
			dragStart.current = { x: e.clientX, y: e.clientY, panX: panX.get(), panY: panY.get() };
			(e.target as HTMLElement).style.cursor = "grabbing";
		},
		[zoom, panX, panY],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!isDragging.current) return;
			panX.set(dragStart.current.panX + (e.clientX - dragStart.current.x));
			panY.set(dragStart.current.panY + (e.clientY - dragStart.current.y));
		},
		[panX, panY],
	);

	const handleMouseUp = useCallback((e: React.MouseEvent) => {
		isDragging.current = false;
		(e.target as HTMLElement).style.cursor = "";
	}, []);

	// Double-click to toggle zoom
	const handleDoubleClick = useCallback(() => {
		if (zoom > 1) {
			resetView();
		} else {
			setZoom(3);
		}
	}, [zoom, resetView]);

	const transformStyle = useTransform([panX, panY], ([x, y]) => `translate(${x}px, ${y}px)`);

	if (!state) return null;

	const current = state.images[state.index];
	const hasMultiple = state.images.length > 1;

	return (
		<AnimatePresence>
			<motion.div
				key="lightbox-overlay"
				className="fixed inset-0 z-[9999] flex flex-col"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.2 }}
			>
				{/* Backdrop */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click to close */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled at document level */}
				<div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={close} />

				{/* Top toolbar */}
				<div className="relative z-10 flex items-center justify-between px-4 py-3">
					<div className="flex items-center gap-1">
						{hasMultiple && (
							<span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white/70">
								{state.index + 1} / {state.images.length}
							</span>
						)}
					</div>

					<div className="flex items-center gap-1">
						{/* Zoom out */}
						<button
							type="button"
							className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
							onClick={zoomOut}
							title="縮小 (-)"
						>
							<svg
								aria-hidden="true"
								focusable="false"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
								<line x1="8" y1="11" x2="14" y2="11" />
							</svg>
						</button>

						{/* Zoom indicator */}
						<button
							type="button"
							className="min-w-[3rem] rounded-lg px-2 py-1 text-center text-xs font-bold text-white/70 transition-colors hover:bg-white/10"
							onClick={resetView}
							title="重設 (0)"
						>
							{Math.round(zoom * 100)}%
						</button>

						{/* Zoom in */}
						<button
							type="button"
							className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
							onClick={zoomIn}
							title="放大 (+)"
						>
							<svg
								aria-hidden="true"
								focusable="false"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
								<line x1="11" y1="8" x2="11" y2="14" />
								<line x1="8" y1="11" x2="14" y2="11" />
							</svg>
						</button>

						<div className="mx-1 h-4 w-px bg-white/10" />

						{/* Rotate */}
						<button
							type="button"
							className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
							onClick={rotate}
							title="旋轉 (R)"
						>
							<svg
								aria-hidden="true"
								focusable="false"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="1 4 1 10 7 10" />
								<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
							</svg>
						</button>

						<div className="mx-1 h-4 w-px bg-white/10" />

						{/* Close */}
						<button
							type="button"
							className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
							onClick={close}
							title="關閉 (Esc)"
						>
							<svg
								aria-hidden="true"
								focusable="false"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
				</div>

				{/* Image area */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: interactive image viewer area */}
				<div
					ref={containerRef}
					className="relative flex flex-1 items-center justify-center overflow-hidden"
					onWheel={handleWheel}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					onDoubleClick={handleDoubleClick}
					style={{ cursor: zoom > 1 ? "grab" : "default" }}
				>
					<AnimatePresence mode="wait">
						<motion.div
							key={`${current.src}-${state.index}`}
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
							style={{
								transform: transformStyle,
							}}
						>
							<img
								src={current.src}
								alt={current.alt ?? ""}
								className="max-h-[80vh] max-w-[90vw] select-none object-contain"
								style={{
									transform: `scale(${zoom}) rotate(${rotation}deg)`,
									transition: "transform 0.3s ease",
								}}
								draggable={false}
							/>
						</motion.div>
					</AnimatePresence>

					{/* Prev/Next arrows */}
					{hasMultiple && (
						<>
							<button
								type="button"
								className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white/60 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white"
								onClick={(e) => {
									e.stopPropagation();
									goPrev();
								}}
								title="上一張 (← / A)"
							>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polyline points="15 18 9 12 15 6" />
								</svg>
							</button>
							<button
								type="button"
								className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white/60 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white"
								onClick={(e) => {
									e.stopPropagation();
									goNext();
								}}
								title="下一張 (→ / D)"
							>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polyline points="9 18 15 12 9 6" />
								</svg>
							</button>
						</>
					)}
				</div>

				{/* Bottom: image alt/caption + thumbnail strip */}
				<div className="relative z-10 px-4 py-3">
					{current.alt && (
						<p className="mb-2 text-center text-sm font-bold text-white/70">{current.alt}</p>
					)}

					{/* Thumbnail strip */}
					{hasMultiple && (
						<div className="flex justify-center gap-1.5 overflow-x-auto py-1">
							{state.images.map((img, i) => (
								<button
									key={img.src}
									type="button"
									className="shrink-0 overflow-hidden rounded-md transition-all"
									style={{
										width: 48,
										height: 36,
										border: i === state.index ? "2px solid white" : "2px solid transparent",
										opacity: i === state.index ? 1 : 0.4,
									}}
									onClick={() => {
										setState((s) => s && { ...s, index: i });
										setZoom(1);
										setRotation(0);
										panX.set(0);
										panY.set(0);
									}}
								>
									<img src={img.src} alt="" className="h-full w-full object-cover" loading="lazy" />
								</button>
							))}
						</div>
					)}

					{/* Keyboard hints */}
					<div className="mt-2 flex justify-center gap-3 text-[10px] text-white/30">
						<span>Esc 關閉</span>
						{hasMultiple && <span>← → 切換</span>}
						<span>+/- 縮放</span>
						<span>滾輪 縮放</span>
						<span>雙擊 放大</span>
						<span>R 旋轉</span>
						<span>0 重設</span>
					</div>
				</div>
			</motion.div>
		</AnimatePresence>
	);
}
