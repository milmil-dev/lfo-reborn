# Item Hover Border Restoration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore visible borders to item cards and the hover preview popup to improve visual hierarchy and feedback.

**Architecture:** Update Tailwind CSS classes in the relevant components to increase border opacity on hover.

**Tech Stack:** React, Tailwind CSS, Lucide React (icons), Motion (animations).

---

### Task 1: Update ItemCard Hover Border

**Files:**
- Modify: `components/items-table.tsx:142`

**Step 1: Modify the hover border opacity**

Modify the `className` in `ItemCard` (approx line 142):
```tsx
// Old
"hover:border-fd-primary/30 hover:shadow-[0_18px_40px_rgba(0,0,0,0.22)] hover:-translate-y-1",

// New
"hover:border-fd-primary/45 hover:shadow-[0_18px_40px_rgba(0,0,0,0.22)] hover:-translate-y-1",
```

**Step 2: Commit**

```bash
git add components/items-table.tsx
git commit -m "fix(ui): increase item card hover border opacity to 45%"
```

---

### Task 2: Restore HoverCardShell Border

**Files:**
- Modify: `components/item-hover-card.tsx:127`

**Step 1: Add border to the hover card container**

Modify the `className` in `HoverCardShell` (approx line 127):
```tsx
// Old
<div className="relative overflow-hidden rounded-2xl bg-fd-card/92 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-xl">

// New
<div className="relative overflow-hidden rounded-2xl border border-fd-primary/35 bg-fd-card/92 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-xl">
```

**Step 2: Commit**

```bash
git add components/item-hover-card.tsx
git commit -m "fix(ui): restore primary border to item hover preview popup"
```
