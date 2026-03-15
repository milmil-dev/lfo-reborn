# Skills Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain skills table, skill images grid, and action GIFs grid with a unified RPG-style tabbed panel with expandable skill cards and motion animations.

**Architecture:** Single `SkillsPanel` component added inline to `components/character-stand-card.tsx`. It receives existing data props and renders 3 tab views. No data model changes needed.

**Tech Stack:** React, Tailwind CSS (fd-* design tokens), motion/react (AnimatePresence, motion.div)

**Spec:** `docs/superpowers/specs/2026-03-15-skills-panel-redesign.md`

---

## File Structure

Only one file is modified:

- **Modify:** `components/character-stand-card.tsx`
  - Add `SkillsPanel` component (new function, ~200 lines)
  - Replace 3 existing sections (lines ~434-511) with single `<SkillsPanel>` call

---

## Task 1: Add SkillsPanel component with tab bar and skills tab

**Files:**
- Modify: `components/character-stand-card.tsx`

- [ ] **Step 1: Add the SkillsPanel function component**

Add this component above the `RawStatsTable` function (before line 569):

```tsx
type TabId = "skills" | "actions" | "gallery";

function SkillsPanel({
  skills,
  skillImages,
  actionGifs,
  color,
}: {
  skills: CharacterSkill[];
  skillImages: SkillImage[];
  actionGifs: ActionGif[];
  color: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("skills");
  const [expandedSkill, setExpandedSkill] = useState<number | null>(null);

  const hasSkills = skills.length > 0;
  const hasActions = actionGifs.length > 0;
  const hasGallery = skillImages.length > 0;

  // Hide entire panel if no data
  if (!hasSkills && !hasActions && !hasGallery) return null;

  // Build visible tabs
  const tabs: { id: TabId; label: string }[] = [];
  if (hasSkills) tabs.push({ id: "skills", label: "招式技能" });
  if (hasActions) tabs.push({ id: "actions", label: "基本動作" });
  if (hasGallery) tabs.push({ id: "gallery", label: "必殺技圖片" });

  // Default to first available tab
  const currentTab = tabs.find((t) => t.id === activeTab) ? activeTab : tabs[0]?.id ?? "skills";

  // Match skill name to skill image
  const skillImageMap = new Map(skillImages.map((si) => [si.name, si.url]));

  const showTabBar = tabs.length > 1;

  return (
    <div className="overflow-hidden rounded-xl border border-fd-border">
      {/* Tab bar */}
      {showTabBar && (
        <div className="flex border-b border-fd-border bg-fd-muted/30">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="px-4 py-2.5 text-xs font-bold transition-colors"
              style={{
                color: currentTab === tab.id ? color : undefined,
                opacity: currentTab === tab.id ? 1 : 0.4,
                borderBottom: currentTab === tab.id ? `2px solid ${color}` : "2px solid transparent",
              }}
              onClick={() => {
                setActiveTab(tab.id);
                setExpandedSkill(null);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="p-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {currentTab === "skills" && (
              <SkillsTab
                skills={skills}
                skillImageMap={skillImageMap}
                color={color}
                expandedSkill={expandedSkill}
                setExpandedSkill={setExpandedSkill}
              />
            )}
            {currentTab === "actions" && (
              <ActionsTab actionGifs={actionGifs} color={color} />
            )}
            {currentTab === "gallery" && (
              <GalleryTab skillImages={skillImages} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SkillsTab sub-component**

Add below `SkillsPanel`:

```tsx
function SkillsTab({
  skills,
  skillImageMap,
  color,
  expandedSkill,
  setExpandedSkill,
}: {
  skills: CharacterSkill[];
  skillImageMap: Map<string, string>;
  color: string;
  expandedSkill: number | null;
  setExpandedSkill: (i: number | null) => void;
}) {
  return (
    <motion.div
      className="flex flex-col gap-1"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
    >
      {skills.map((skill, i) => {
        const isExpanded = expandedSkill === i;
        const imageUrl = skillImageMap.get(skill.name);
        const showCost = skill.cost && skill.cost !== "--";
        const showLP = skill.learnPoints && skill.learnPoints !== "--";

        return (
          <motion.div
            key={i}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <div
              className="cursor-pointer overflow-hidden rounded-lg border transition-colors"
              style={{
                borderColor: isExpanded ? `${color}30` : "var(--color-fd-border)",
                background: isExpanded ? `${color}08` : "transparent",
              }}
              onClick={() => setExpandedSkill(isExpanded ? null : i)}
            >
              {/* Collapsed header */}
              <div className="flex items-center gap-3 p-3">
                {/* Skill thumbnail */}
                <SkillThumbnail url={imageUrl} color={color} />

                {/* Skill name */}
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold" style={{ color }}>
                    {skill.name}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5">
                  {showCost && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: `${color}15`, color }}
                    >
                      {skill.cost}
                    </span>
                  )}
                  {showLP && (
                    <span className="rounded bg-fd-muted px-1.5 py-0.5 text-[10px] font-bold text-fd-muted-foreground">
                      {skill.learnPoints}學點
                    </span>
                  )}
                  {skill.command && skill.command !== "--" && (
                    <span className="rounded bg-black/30 px-2 py-0.5 font-mono text-[10px] text-fd-muted-foreground">
                      {skill.command}
                    </span>
                  )}
                </div>

                {/* Chevron */}
                <span
                  className="text-[10px] text-fd-muted-foreground transition-transform duration-200"
                  style={{ transform: isExpanded ? "rotate(90deg)" : "none" }}
                >
                  ▶
                </span>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
                    exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex gap-4 border-t px-3 pb-3 pt-3"
                      style={{ borderColor: `${color}15` }}
                    >
                      {/* Skill image */}
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={skill.name}
                          className="aspect-video w-full max-w-[200px] rounded-lg object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="flex aspect-video w-full max-w-[200px] items-center justify-center rounded-lg"
                          style={{ background: `${color}10` }}
                        >
                          <span className="text-xs font-bold" style={{ color, opacity: 0.3 }}>
                            {skill.name}
                          </span>
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex flex-1 flex-col gap-1.5">
                        {skill.trigger && skill.trigger !== "--" && (
                          <span className="inline-flex w-fit items-center gap-1 rounded bg-fd-muted px-2 py-0.5 text-[10px]">
                            <span className="text-fd-muted-foreground">觸發</span>
                            <span className="font-bold" style={{ color }}>
                              {skill.trigger}
                            </span>
                          </span>
                        )}
                        {skill.notes && (
                          <p className="text-xs leading-relaxed text-fd-muted-foreground">
                            {skill.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function SkillThumbnail({ url, color }: { url?: string; color: string }) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
        style={{ border: `1px solid ${color}20` }}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={{
        background: `linear-gradient(135deg, ${color}20, ${color}08)`,
        border: `1px solid ${color}20`,
      }}
    >
      <span style={{ color, opacity: 0.4, fontSize: 10 }}>⚔</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify the file compiles (no errors)**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (or only pre-existing ones unrelated to this file)

- [ ] **Step 4: Commit**

```bash
git add components/character-stand-card.tsx
git commit -m "feat: add SkillsPanel and SkillsTab components"
```

---

## Task 2: Add ActionsTab and GalleryTab sub-components

**Files:**
- Modify: `components/character-stand-card.tsx`

- [ ] **Step 1: Add ActionsTab component**

Add below `SkillThumbnail`:

```tsx
function ActionsTab({
  actionGifs,
  color,
}: {
  actionGifs: ActionGif[];
  color: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
      {actionGifs.map((ag, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-1 rounded-lg border border-fd-border p-2 transition-all duration-150 hover:-translate-y-0.5"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = `${color}40`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "";
          }}
        >
          <img
            src={ag.url}
            alt={ag.label}
            className="h-20 w-auto object-contain"
            loading="lazy"
          />
          <span className="text-[10px] font-bold" style={{ color }}>
            {ag.label}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add GalleryTab component**

Add below `ActionsTab`:

```tsx
function GalleryTab({ skillImages }: { skillImages: SkillImage[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {skillImages.map((si, i) => (
        <div
          key={i}
          className="group relative overflow-hidden rounded-lg border border-fd-border"
        >
          <img
            src={si.url}
            alt={si.name}
            className="aspect-video w-full object-cover transition-transform duration-150 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
            <span className="text-xs font-bold text-white">{si.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to this file

- [ ] **Step 4: Commit**

```bash
git add components/character-stand-card.tsx
git commit -m "feat: add ActionsTab and GalleryTab components"
```

---

## Task 3: Replace old sections with SkillsPanel in CharacterStandCard

**Files:**
- Modify: `components/character-stand-card.tsx`

- [ ] **Step 1: Replace the 3 old sections**

In `CharacterStandCard`, replace everything from the comment `{/* Skills Table */}` (line ~434) through the closing `)}` of the `{/* Action GIFs */}` block (line ~511). The exact boundaries are:

- **Start marker:** `{/* Skills Table */}`
- **End marker:** The closing `</div>\n\t\t\t)}` right before `{/* Portraits */}`

Replace with:

```tsx
			{/* Skills, Actions & Gallery Panel */}
			<SkillsPanel
				skills={data.skills}
				skillImages={data.skillImages ?? []}
				actionGifs={data.actionGifs ?? []}
				color={data.color}
			/>
```

- [ ] **Step 2: Verify compilation**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Visual verification**

Run: `bun run dev`

Open a character page (e.g., `/docs/character/freeze`) and verify:
1. Tabbed panel appears where the old sections were
2. Skills tab shows expandable cards
3. Clicking a skill card expands it with animation
4. Actions tab shows GIF grid with hover effects
5. Gallery tab shows skill images with overlays
6. Tab switching animates smoothly
7. All other sections (profile, radar, weapons, portraits, stats) are unchanged

- [ ] **Step 4: Test edge cases**

Check these character pages:
- A character with no skills data — panel should hide
- A character with skills but no skill images — placeholder thumbnails
- A transform page (`/docs/character/freeze/r`) — verify transform data loads correctly in the panel

- [ ] **Step 5: Commit**

```bash
git add components/character-stand-card.tsx
git commit -m "feat: replace skills/actions/gallery sections with unified SkillsPanel"
```
