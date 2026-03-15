# Skills Panel Redesign

**Date:** 2026-03-15
**Status:** Approved

## Problem

The character page displays skill data, skill images, and action GIFs as three disconnected sections using a plain HTML table and basic grids. This feels flat and disconnected — skills, their images, and action animations should be presented as a cohesive, polished RPG-style panel.

## Scope

Replace 3 existing sections in `CharacterStandCard` (`components/character-stand-card.tsx`) with a single unified tabbed component. All other sections remain untouched:

- Profile header + radar chart — no change
- Profile info tags — no change
- Weapon/equipment cards — no change
- Portraits + dialog portraits — no change
- Raw stats collapsible — no change

## Design

### Architecture

Extract a new `SkillsPanel` component inline in `character-stand-card.tsx` (co-located with existing types `SkillImage`, `ActionGif`, `CharacterSkill`) that replaces these 3 sections:

1. **招式技能** (Skills Table) — lines ~434-467
2. **角色必殺技圖片** (Skill Images) — lines ~469-489
3. **角色基本動作** (Action GIFs) — lines ~491-511

### Component: SkillsPanel

**Props:**
```ts
interface SkillsPanelProps {
  skills: CharacterSkill[];
  skillImages: SkillImage[];
  actionGifs: ActionGif[];
  color: string; // character accent color
}
```

**Structure:** Single bordered container with 3 tabs.

#### Tab Bar
- Horizontal tab row at the top: `招式技能` | `基本動作` | `必殺技圖片`
- Active tab: character accent color text + 2px bottom border in accent color
- Inactive tabs: muted opacity (0.4), no border
- Tab state managed via `useState<'skills' | 'actions' | 'gallery'>`
- Tabs that have no data (empty array) are hidden

#### Tab 1: 招式技能 (Expandable Skill Cards)

Vertical list of skill cards, one per skill from `CharacterSkill[]`.

**Collapsed state (default):**
- Left: skill image thumbnail (36x36, rounded-lg) — matched by skill name from `skillImages[]`, fallback to accent-colored placeholder
- Center: skill name (font-bold, accent color), below it nothing
- Right side badges: cost displayed as-is from `skill.cost` string (accent-tinted badge; if "--" or undefined, hide badge), learn points (muted badge; if "--" or undefined, hide), command input (monospace, dark background pill)
- Chevron indicator (▸), rotates to (▾) when expanded via CSS `rotate(90deg)` transition

**Expanded state (on click):**
- Card border shifts to accent color
- Below the header row, a divider + expanded content area appears
- Left: skill image from `skillImages[]` (`max-w-[200px] w-full`, aspect-video, rounded — scales down on mobile)
- Right: trigger/notes info as small badges, plus any description text
- Animated with `AnimatePresence` — height + opacity transition (250ms ease-out)

**Skill name matching:** Exact string match of `skill.name` against `skillImages[].name`. If no match, show a gradient placeholder with accent color. (Data is extracted from the same source so names should match exactly.)

**Accordion behavior:** Only one skill card can be expanded at a time. Expanding a card auto-collapses any previously expanded card.

#### Tab 2: 基本動作 (Action GIFs Grid)

Responsive grid matching current breakpoints: `grid-cols-3 sm:grid-cols-4 md:grid-cols-7`.

Each cell:
- Bordered card with rounded corners
- GIF image (object-contain, `h-20` / 80px — same as current)
- Label below (small text, accent color)
- Hover: `translateY(-2px)` + border color shifts to accent (CSS transition, 150ms)

#### Tab 3: 必殺技圖片 (Skill Images Gallery)

2-column grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4` — same as current).

Each cell:
- Bordered card with overflow hidden
- Image (aspect-video, object-cover)
- Gradient overlay from bottom with skill name in white bold text
- Hover: slight scale (1.03) on the image (CSS transition)

### Animations

All animations use `motion/react` (already imported in the file).

| Animation | Trigger | Duration | Easing |
|-----------|---------|----------|--------|
| Tab content switch | Tab click | 200ms | easeOut |
| Skill card expand | Card click | 250ms | easeOut |
| Skill card collapse | Card click | 200ms | easeIn |
| Card stagger on mount | Initial render | 50ms stagger | easeOut |
| Action GIF hover lift | Mouse enter | 150ms | CSS ease |

**Tab switch animation:** Wrap tab content in `AnimatePresence mode="wait"` with `key={activeTab}`. Entering content: `opacity: 0, y: 8` → `opacity: 1, y: 0`. Exiting: `opacity: 0, y: -4`.

**Skill expand animation:** Use `motion.div` with `initial={{ height: 0, opacity: 0 }}` and `animate={{ height: 'auto', opacity: 1 }}`. The `layout` prop is NOT needed since only one card expands at a time.

**Stagger:** Wrap skill list in a parent `motion.div` with `staggerChildren: 0.05` in `transition`. Each child uses `initial={{ opacity: 0, y: 8 }}` → `animate={{ opacity: 1, y: 0 }}`.

### Styling

- Uses existing Tailwind classes from the project (`fd-border`, `fd-card`, `fd-muted`, etc.)
- Character accent color (`data.color`) used for: active tab indicator, skill names, badges, hover borders
- Dark theme consistent with existing page design
- Responsive: works on mobile (tabs stack content, grids reduce columns)

### Data Flow

No changes to data model or data loading. The `CharacterStandCard` component already loads all required data:

- `data.skills` → `CharacterSkill[]` from `getCharacterSkillData()`
- `data.skillImages` → `SkillImage[]` from `characters.json` or `transforms.json`
- `data.actionGifs` → `ActionGif[]` from `characters.json` or `transforms.json`

### Files Changed

1. `components/character-stand-card.tsx` — Replace 3 sections with `<SkillsPanel>`, add the `SkillsPanel` component (can be inline or extracted)

### Edge Cases

- All three arrays empty — hide the entire panel
- Character with skills but no skill images — show placeholder thumbnails in skill cards
- Character with no action GIFs — hide the 基本動作 tab
- Character with no skill images array — hide the 必殺技圖片 tab
- Only one tab has data — show panel without tab bar, just the content directly
- Skill name doesn't match any skill image name — show gradient placeholder
- Image fails to load — use `onError` to swap to gradient placeholder
- All images use `loading="lazy"` to match existing behavior
