import { animate, stagger } from "motion";
import { CAST, CHAPTER, type Face, type Line, PROLOGUE } from "./story";

type SceneId = "boot" | "prologue" | "title" | "chapter" | "story";

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
	root.querySelector(sel) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
// keep the logo glow while animating its blur
const GLOW = "drop-shadow(0 10px 30px rgba(0, 0, 0, 0.55)) drop-shadow(0 0 24px rgba(88, 184, 255, 0.28))";

function wait(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
	});
}

/* ───────── audio ───────── */

const audio = {
	bgm: null as HTMLAudioElement | null,
	play(name: string, volume = 0.5) {
		const prev = this.bgm;
		if (prev?.dataset.name === name) return;
		if (prev) this.fadeOut(prev);
		const next = new Audio(`/assets/audio/${name}`);
		next.dataset.name = name;
		next.loop = true;
		next.volume = 0;
		next.play().catch(() => {});
		animate(0, volume, { duration: 1.2, onUpdate: (v) => (next.volume = v) });
		this.bgm = next;
	},
	stop() {
		if (this.bgm) this.fadeOut(this.bgm);
		this.bgm = null;
	},
	fadeOut(el: HTMLAudioElement) {
		animate(el.volume, 0, { duration: 0.8, onUpdate: (v) => (el.volume = v), onComplete: () => el.pause() });
	},
	sfx(name: string, volume = 0.45) {
		const a = new Audio(`/assets/audio/${name}`);
		a.volume = volume;
		a.play().catch(() => {});
	},
};

/* ───────── 元力 motes: slow glowing particles drifting upward ───────── */

function runMotes(canvas: HTMLCanvasElement, signal: AbortSignal, density = 70) {
	if (reduced) return;
	const ctx = canvas.getContext("2d")!;
	const dpr = Math.min(devicePixelRatio, 2);
	const fit = () => {
		canvas.width = canvas.clientWidth * dpr;
		canvas.height = canvas.clientHeight * dpr;
	};
	fit();
	addEventListener("resize", fit, { signal });
	const motes = Array.from({ length: density }, () => ({
		x: Math.random(),
		y: Math.random(),
		r: 0.6 + Math.random() * 1.8,
		v: 0.00015 + Math.random() * 0.0005,
		phase: Math.random() * Math.PI * 2,
	}));
	let raf = 0;
	const tick = (t: number) => {
		const { width: w, height: h } = canvas;
		ctx.clearRect(0, 0, w, h);
		for (const m of motes) {
			m.y -= m.v;
			if (m.y < -0.02) (m.y = 1.02), (m.x = Math.random());
			const x = (m.x + Math.sin(t / 2400 + m.phase) * 0.01) * w;
			const a = 0.35 + 0.35 * Math.sin(t / 900 + m.phase);
			const g = ctx.createRadialGradient(x, m.y * h, 0, x, m.y * h, m.r * 6 * dpr);
			g.addColorStop(0, `rgba(200,235,255,${a})`);
			g.addColorStop(1, "rgba(88,184,255,0)");
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(x, m.y * h, m.r * 6 * dpr, 0, Math.PI * 2);
			ctx.fill();
		}
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);
	signal.addEventListener("abort", () => cancelAnimationFrame(raf), { once: true });
}

/* ───────── scene switching ───────── */

let current: SceneId = "boot";
let sceneAbort = new AbortController();
let switching = false;

const enter: Record<SceneId, (signal: AbortSignal) => void> = {
	boot: () => {},
	prologue: enterPrologue,
	title: enterTitle,
	chapter: enterChapter,
	story: enterStory,
};

async function go(next: SceneId) {
	if (switching || next === current) return;
	switching = true;
	sceneAbort.abort();
	sceneAbort = new AbortController();
	const from = $(`#${current}`);
	const to = $(`#${next}`);
	const wipe = $(".wipe");

	animate(wipe, { scaleX: [0, 1], opacity: [0, 1] }, { duration: 0.5, ease: EASE_OUT });
	await animate(from, { opacity: 0 }, { duration: 0.45 });
	from.removeAttribute("data-active");
	from.style.opacity = "";

	to.style.opacity = "0";
	to.setAttribute("data-active", "");
	current = next;
	enter[next](sceneAbort.signal);
	animate(wipe, { opacity: 0 }, { duration: 0.6, delay: 0.1 });
	await animate(to, { opacity: 1 }, { duration: 0.7 });
	switching = false;
}

/* ───────── 0 boot ───────── */

function boot() {
	const start = () => {
		if (current !== "boot") return;
		audio.sfx("johnnyconfirm.wav", 0.5);
		// #title / #chapter / #story jump straight there (handy while iterating)
		const target = location.hash.slice(1) as SceneId;
		go(target in enter && target !== "boot" ? target : "prologue");
	};
	$(".press").addEventListener("click", start);
	addEventListener("keydown", (e) => current === "boot" && !e.metaKey && start());
	animate("#boot .logo", { opacity: [0, 1], filter: [`blur(12px) ${GLOW}`, `blur(0px) ${GLOW}`] }, { duration: 1.6 });
}

/* ───────── 1 prologue ───────── */

const PANO_H = 511 * 4;

function enterPrologue(signal: AbortSignal) {
	audio.play("lfo_intro2_2.ogg", 0.55);
	runMotes($("#prologue .motes") as HTMLCanvasElement, signal, 50);

	const pano = $(".pano");
	const lineEl = $(".prologue-line");
	const perLine = 3600;
	const total = PROLOGUE.length * perLine + 1200;
	const s = Math.max(innerWidth / 800, innerHeight / PANO_H);
	const travel = PANO_H * s - innerHeight;
	const at = (y: number) => `translateX(-50%) translateY(${y}px) scale(${s})`;
	pano.style.transform = at(0);
	if (!reduced) {
		const cam = animate(pano, { transform: [at(0), at(-travel)] }, { duration: total / 1000, ease: [0.45, 0, 0.3, 1] });
		signal.addEventListener("abort", () => cam.stop(), { once: true });
	}

	(async () => {
		for (const text of PROLOGUE) {
			if (signal.aborted) return;
			lineEl.textContent = text;
			await animate(
				lineEl,
				{ opacity: [0, 1], filter: ["blur(10px)", "blur(0px)"], letterSpacing: ["0.32em", "0.14em"] },
				{ duration: reduced ? 0.3 : 1.2, ease: EASE_OUT },
			);
			await wait(perLine - 1900, signal);
			if (signal.aborted) return;
			await animate(lineEl, { opacity: 0, filter: "blur(6px)" }, { duration: 0.6 });
		}
		await wait(600, signal);
		if (!signal.aborted) go("title");
	})();
}

/* ───────── 2 title ───────── */

function enterTitle(signal: AbortSignal) {
	audio.play("lfo_theme.ogg", 0.5);
	runMotes($("#title .motes") as HTMLCanvasElement, signal, 40);

	animate("#title .logo", { opacity: [0, 1], y: [-12, 0], filter: [`blur(10px) ${GLOW}`, `blur(0px) ${GLOW}`] }, { duration: 1.2, ease: EASE_OUT });
	animate("#title .menu-item", { opacity: [0, 1], x: [-18, 0] }, { delay: stagger(0.08, { startDelay: 0.5 }), duration: 0.6, ease: EASE_OUT });
	animate(".keyart", { opacity: [0, 1], y: [30, 0], rotate: [6, 2] }, { type: "spring", stiffness: 60, damping: 14, delay: 0.3 });

	if (!reduced) {
		const bg = $(".title-bg");
		const art = $(".keyart");
		addEventListener(
			"pointermove",
			(e) => {
				const nx = e.clientX / innerWidth - 0.5;
				const ny = e.clientY / innerHeight - 0.5;
				animate(bg, { x: nx * -18, y: ny * -12 }, { duration: 1.2, ease: EASE_OUT });
				animate(art, { x: nx * 10, y: ny * 8 }, { duration: 1.2, ease: EASE_OUT });
			},
			{ signal },
		);
	}
	(document.querySelector<HTMLButtonElement>('.menu-item[data-go="chapter"]'))?.focus({ preventScroll: true });
}

/* ───────── 3 chapter card ───────── */

function enterChapter(signal: AbortSignal) {
	audio.stop();
	const num = $(".card-num");
	const title = $(".card-title");
	const branch = $(".card-branch");
	const stage = $(".card-stage");
	num.textContent = CHAPTER.number;
	title.textContent = CHAPTER.title;
	branch.textContent = CHAPTER.branch;
	stage.textContent = "";
	for (const el of [num, title, branch]) el.style.opacity = "0";

	(async () => {
		await wait(300, signal);
		animate(".card-line", { scaleX: [0, 1], opacity: [0, 1] }, { duration: 0.7, ease: EASE_OUT });
		await animate(num, { opacity: [0, 1], x: [-60, 0] }, { duration: 0.6, ease: EASE_OUT });
		await animate(title, { opacity: [0, 1], x: [60, 0] }, { duration: 0.6, ease: EASE_OUT });
		animate(branch, { opacity: [0, 1] }, { duration: 0.8 });
		for (const ch of CHAPTER.stage) {
			if (signal.aborted) return;
			stage.textContent += ch;
			await wait(45, signal);
		}
		await wait(1800, signal);
		if (!signal.aborted) go("story");
	})();
}

/* ───────── 4 story ───────── */

const story = {
	idx: -1,
	typing: null as { complete(): void } | null,
	auto: false,
	speaker: "" as string,
	scene: "" as Line["scene"] | "",
	log: [] as { name: string; text: string }[],
	busy: false,
};

function faceStyle(el: HTMLElement, face: Face) {
	el.style.backgroundImage = `url(/assets/img/${face.sheet}.png)`;
	el.style.backgroundPosition = `calc(${-face.col} * 170.67px * var(--ps)) calc(${-face.row} * 228px * var(--ps))`;
}

function worldTransform(world: HTMLElement, x: number) {
	const s = innerHeight / (world.classList.contains("plaza") ? 626 : 604);
	return { s, t: `translateX(${x}px) scale(${s})` };
}

let pan: ReturnType<typeof animate> | null = null;
function showWorld(name: Line["scene"]) {
	const next = $(`.world.${name}`);
	const prev = story.scene ? $(`.world.${story.scene}`) : null;
	story.scene = name;
	pan?.stop();
	const { s } = worldTransform(next, 0);
	const width = (name === "plaza" ? 2556 : 1652) * s;
	const span = Math.max(0, width - innerWidth);
	const start = name === "plaza" ? 0 : -span * 0.35;
	next.style.transform = worldTransform(next, start).t;
	if (prev) animate(prev, { opacity: 0 }, { duration: 0.9 });
	animate(next, { opacity: [0, 1] }, { duration: 0.9 });
	if (!reduced && span > 0)
		pan = animate(
			next,
			{ transform: [worldTransform(next, start).t, worldTransform(next, name === "plaza" ? -span : -span * 0.55).t] },
			{ duration: name === "plaza" ? 40 : 30, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" },
		);
}

async function battleBeat() {
	const el = document.createElement("div");
	el.className = "beat";
	el.innerHTML = `<p class="beat-vs">VS</p><p class="beat-names">域多 · 歷奇</p><p class="beat-note">戰鬥部分之後再實作</p>`;
	$("#story").append(el);
	audio.sfx("johnnyconfirm.wav", 0.5);
	await animate(el, { opacity: [0, 1] }, { duration: 0.25 });
	await animate(".beat-vs", { scale: [2.4, 1], opacity: [0, 1] }, { type: "spring", stiffness: 260, damping: 16 });
	await wait(1300);
	await animate(el, { opacity: 0 }, { duration: 0.4 });
	el.remove();
}

async function showLine(i: number) {
	const line = CHAPTER.lines[i];
	const dialog = $(".dialog");
	const portrait = $(".portrait");
	const img = $(".portrait-img");
	const textEl = $(".dialog-text");
	story.busy = true;
	dialog.removeAttribute("data-done");

	if (line.beat === "battle") {
		animate(dialog, { opacity: 0 }, { duration: 0.2 });
		animate(portrait, { opacity: 0 }, { duration: 0.2 });
		story.speaker = "";
		await battleBeat();
		animate(dialog, { opacity: 1 }, { duration: 0.3 });
	}
	if (line.scene !== story.scene) showWorld(line.scene);

	const who = line.who ?? "";
	const speaker = who ? CAST[who] : undefined;
	if (who !== story.speaker) {
		if (story.speaker) await animate(portrait, { opacity: 0, x: portrait.dataset.side === "right" ? 30 : -30 }, { duration: 0.18 });
		if (speaker && line.face) {
			portrait.dataset.side = speaker.side;
			faceStyle(img, line.face);
			if (speaker.voice) audio.sfx(speaker.voice, 0.35);
			animate(portrait, { opacity: [0, 1], x: [speaker.side === "right" ? 40 : -40, 0] }, { type: "spring", stiffness: 320, damping: 26 });
		} else {
			portrait.style.opacity = "0";
		}
		story.speaker = who;
	} else if (line.face) {
		faceStyle(img, line.face);
		if (!reduced) animate(img, { scaleY: [0.95, 1], y: [5, 0] }, { type: "spring", stiffness: 500, damping: 18 });
	}

	dialog.dataset.side = speaker?.side ?? "";
	if (!speaker) dialog.removeAttribute("data-side");
	dialog.toggleAttribute("data-narration", !speaker);
	$(".nameplate").textContent = speaker?.name ?? "";

	textEl.replaceChildren(
		...[...line.text].map((ch) => {
			if (ch === "\n") return document.createElement("br");
			const s = document.createElement("span");
			s.className = "ch";
			s.textContent = ch;
			return s;
		}),
	);
	story.log.push({ name: speaker?.name ?? "旁白", text: line.text.replace(/\n/g, "") });
	story.busy = false;

	// typewriter via class toggles: per-glyph compositor animations inside a
	// backdrop-filter panel leave dark boxes behind the text in Chromium
	await typeOut([...textEl.querySelectorAll<HTMLElement>(".ch")]);
	dialog.setAttribute("data-done", "");
	if (story.auto && current === "story") {
		const at = story.idx;
		await wait(1400 + line.text.length * 45);
		if (story.auto && story.idx === at && current === "story") advance();
	}
}

function typeOut(chars: HTMLElement[]) {
	return new Promise<void>((resolve) => {
		let i = 0;
		let timer = 0;
		const finish = () => {
			clearInterval(timer);
			for (const c of chars) c.classList.add("on");
			story.typing = null;
			resolve();
		};
		story.typing = { complete: finish };
		if (reduced) return finish();
		timer = window.setInterval(() => {
			chars[i++]?.classList.add("on");
			if (i >= chars.length) finish();
		}, 30);
	});
}

function advance() {
	if (current !== "story" || story.busy || !$(".log").hidden) return;
	if (story.typing) {
		story.typing.complete();
		return;
	}
	audio.sfx("pick.wav", 0.3);
	if (story.idx + 1 >= CHAPTER.lines.length) {
		endChapter();
		return;
	}
	story.idx++;
	showLine(story.idx);
}

async function endChapter() {
	story.busy = true;
	const el = document.createElement("div");
	el.className = "beat";
	el.innerHTML = `<p class="beat-names">學校（星奇線）——完</p><p class="beat-note">待續 · 下集：體育館</p>`;
	$("#story").append(el);
	await animate(el, { opacity: [0, 1] }, { duration: 0.8 });
	await wait(2600);
	el.remove();
	go("title");
}

function enterStory(signal: AbortSignal) {
	audio.play("lfo_school1.ogg", 0.4);
	Object.assign(story, { idx: -1, typing: null, speaker: "", scene: "", log: [], busy: false });
	for (const w of document.querySelectorAll<HTMLElement>(".world")) w.style.opacity = "0";
	$(".portrait").style.opacity = "0";
	$(".dialog-text").textContent = "";
	$(".nameplate").textContent = "";
	$(".log").hidden = true;
	signal.addEventListener("abort", () => pan?.stop(), { once: true });

	if (!reduced) {
		addEventListener(
			"pointermove",
			(e) => {
				const nx = e.clientX / innerWidth - 0.5;
				animate(".gate .l-lamp", { x: nx * -40 }, { duration: 1, ease: EASE_OUT });
				animate(".gate .l-tree", { x: nx * -60 }, { duration: 1, ease: EASE_OUT });
			},
			{ signal },
		);
	}
	animate(".dialog", { opacity: [0, 1], y: [30, 0] }, { duration: 0.7, ease: EASE_OUT }).then(() => {
		if (!signal.aborted) advance();
	});
}

function toggleLog() {
	const log = $(".log");
	if (log.hidden) {
		$("ol", log).replaceChildren(
			...story.log.map(({ name, text }) => {
				const li = document.createElement("li");
				li.innerHTML = "<b></b><span></span>";
				li.querySelector("b")!.textContent = name;
				li.querySelector("span")!.textContent = text;
				return li;
			}),
		);
		log.hidden = false;
		animate(log, { opacity: [0, 1] }, { duration: 0.25 });
		const ol = $("ol", log);
		ol.scrollTop = ol.scrollHeight;
	} else {
		log.hidden = true;
	}
}

function toggleAuto(btn: HTMLElement) {
	story.auto = !story.auto;
	btn.setAttribute("aria-pressed", String(story.auto));
	if (story.auto && !story.typing) advance();
}

/* ───────── wiring ───────── */

// title backdrop: scale the two panorama rows (800×1022) to cover the viewport
const fitTitlePano = () =>
	$(".pano.mini").style.setProperty("--k", String(Math.max((innerWidth * 1.06) / 800, (innerHeight * 1.06) / 1022)));
fitTitlePano();
addEventListener("resize", fitTitlePano);

$(".skip").addEventListener("click", () => go("title"));
$('.menu-item[data-go="chapter"]').addEventListener("click", () => {
	audio.sfx("johnnyconfirm.wav", 0.5);
	go("chapter");
});
$(".dialog").addEventListener("click", advance);
$(".stage").addEventListener("click", advance);
for (const btn of document.querySelectorAll<HTMLElement>("#story [data-act]")) {
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		const act = btn.dataset.act;
		if (act === "log") toggleLog();
		if (act === "auto") toggleAuto(btn);
		if (act === "exit") go("title");
	});
}

addEventListener("keydown", (e) => {
	if (current === "prologue" && (e.key === "Escape" || e.key === "Enter")) go("title");
	if (current !== "story") return;
	if (e.key === " " || e.key === "Enter") {
		e.preventDefault();
		advance();
	} else if (e.key === "Escape") {
		if (!$(".log").hidden) toggleLog();
		else go("title");
	} else if (e.key.toLowerCase() === "l") toggleLog();
	else if (e.key.toLowerCase() === "a") toggleAuto($('[data-act="auto"]'));
});

boot();
