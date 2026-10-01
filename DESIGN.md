# Design System — LFO 資料博物館

**Direction:** *Arcade Editorial* — a modern game encyclopedia where the original LFO art is the hero
and the chrome around it stays quiet. Not a docs site, not a dashboard, not Y2K skeuomorphism.
**Updated:** 2026-09-30

## References (what we borrow, and why)

| Reference | Pattern we take |
|---|---|
| VALORANT agent pages | Full-bleed art offset to one side, huge name + index number, ability **icon selector → detail panel** |
| Pokémon Pokédex | `#002` numbering with previous / next navigation, colour-by-type data panels |
| Honkai: Star Rail characters | Grouping rail (factions → our 主角 / 型態 / 其他), art overflowing its panel, roster strip to jump between characters |
| Prydwen-style gacha databases | Dense filter chips, instant search, compact cards that still carry art |
| Long-form editorial (NYT features, Medium) | Serif body for reading, ~36 CJK chars / 66 Latin chars per line, big titles, quiet UI chrome |

## Principles

1. **Art first.** Every entity (character, item, skill) is shown by its original game art, big. UI never competes with it.
2. **Colour comes from the art.** The pipeline extracts each image's dominant colour (`color` column); cards and hero fields are tinted with it. The global palette stays neutral so entity colour reads.
3. **No decorative borders.** Separate regions with surface steps, space and type. Borders only on inputs and focus rings.
4. **Numbers are data.** Stats use tabular figures and a mono face; bars are flat, not glowing.
5. **Motion explains navigation.** Card → detail uses a shared-element View Transition on the art; lists stagger only the first screenful; everything respects `prefers-reduced-motion`.

## Colour

Dark only (a game site). Tokens live in `web/src/global.css`.

| Token | Value | Use |
|---|---|---|
| `background` | `#0B0D12` | page |
| `surface` | `#13161E` | cards, panels |
| `surface-2` | `#1B1F2A` | hover, inputs, nested panels |
| `foreground` | `#F3F5F9` | text |
| `muted-foreground` | `#8A92A6` | secondary text |
| `primary` | `#E8343C` (LFO logo red) | active nav, primary actions, focus |
| `highlight` | `#FFD447` (logo "ONLINE" yellow) | ★ tiers, 奧義, prices — sparingly |
| `mana` | `#58A6FF` (元力 blue) | MP |
| `up` / `down` | `#4ADE9A` / `#FF6B7A` | stat modifiers |
| `--entity` | per record, from pipeline | tinted gradients / glows on cards and heroes |

Entity tint recipe: `color-mix(in oklab, var(--entity) 28%, var(--surface))` for fills,
`color-mix(in oklab, var(--entity) 55%, transparent)` for glows. Never use the raw colour as text.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display + UI (Latin) | Satoshi 500/700/900 (+900 italic) | Fontshare; headings at `font-black`, tracking `-0.03em` |
| Display + UI (CJK) | Noto Sans TC 400–900 | falls back after Satoshi in `--font-sans` |
| Index numbers / counts | Satoshi 900 italic uppercase (`font-arcade`) | the "arcade" voice |
| Reading (prologue, stories, item lore) | Noto Serif TC 400 | 18px / 1.9, measure ~36em for CJK |
| Data | JetBrains Mono 500 | stats, prices, IDs; `tabular-nums` |

Headline rules: an H1 never wraps past 2–3 lines (wide container, `clamp()` size); no orphaned single characters.

## Motion

GSAP + ScrollTrigger (`web/src/components/motion.tsx`), all gated by `prefers-reduced-motion`:

- **Entrance:** hero lines rise out of an overflow mask (`yPercent 110 → 0`, expo.out, 0.12s stagger); art scales 0.92 → 1.
- **Reveal:** `[data-reveal]` blocks fade/rise in batches as they enter.
- **Scrub:** the prologue brightens character by character (opacity 0.1 → 1) as it is scrolled through.
- **Pin:** a section title stays put while its gallery scrolls past (desktop).
- **Scale & fade:** gallery cards grow 0.8 → 1 on the way in, darken to 0.2 on the way out.
- **Hover physics:** art inside `overflow-hidden` scales 1.05 over 700ms; arrows rotate; accordions grow with `flex-grow`.
- **Pointer parallax:** hero art drifts against the cursor (`gsap.quickTo`).
- **Navigation:** View Transitions morph character art from card to detail hero.
- Triggers re-measure on document resize (lazy images), so pins and reveals stay correct.

## Shape & space

- Radius: `rounded-2xl` (cards), `rounded-3xl` (hero panels), `rounded-full` (chips, key caps).
- Spacing on the 4px Tailwind scale. Home sections are chapters: `py-32 md:py-48` between them.
- Bento grids use `grid-flow-dense` and must tile with zero empty cells.
- Max content width `max-w-7xl`; reading pages `max-w-[42rem]`.

## Components

- **Nav:** floating glass pill — LFO chrome logo (the one authentic brand mark), the four 圖鑑, a solid ⌘K search button.
- **Entity card:** tinted fill, art overflowing the top edge on hover (`translate-y-[-6px] scale-[1.04]`), name + small Latin line.
- **Detail hero:** two columns — art on a tinted field with a giant faded index number behind it; name, Latin name, prev / next.
- **Skill selector:** row of skill icons; the selected one expands into name, key caps (防 攻 跳 → ↑ ↓), MP, tier.
- **Key caps:** `kbd` pills — action keys solid, directions outlined.
- **Filter chips:** pill toggles with counts; the active chip is solid foreground on background.
- **Detail sheet:** items open in a right-side sheet so the grid context stays.

## Don'ts

- No meta-labels ("SECTION 01", English eyebrows over Chinese titles).

- No chrome gradients, bevels, screws, scanlines or glowing text in UI (the chrome logo is the only exception — it is content).
- No borders around cards or sections.
- No neutral grey placeholder art — fall back to the entity's initial on its tint.
