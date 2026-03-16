# Weapon & Equipment Display Redesign

## Summary
Redesign the 角色專用武器 / 裝備 section on character pages with compact inline layout, full field display, and multi-item support.

## Visual Design: Compact Inline Rows (Option B)
- Horizontal rows: image left (56px), info right
- Items stack vertically with subtle dividers
- Weapons: gold accent (#ffbf00), Equipment: blue accent (#00bfff)
- Type badge (武器/裝備) as colored pill next to item name

### Weapon Card Fields
- Image + name + type badge
- Description (italic, muted)
- Inline stats: 成份 · 特效 · 消耗 · 耐久 · 價格

### Equipment Card Fields
- Image + name + type badge
- Description (if exists)
- Stat bonuses grid: HP/MP/SP/STR/DEF/AGI with green +/red - coloring
- Inline stats: 成份 · 耐久 · 價格
- 需求能力 (requirements, if exists, smaller text)

## Data Structure Changes

### Unified Item Type
```typescript
interface CharacterItem {
  type: 'weapon' | 'equipment';
  name: string;
  image?: string;
  description?: string;
  material?: string;    // 成份
  effect?: string;      // 特效 (weapons)
  cost?: string;        // 消耗 (weapons)
  durability?: string;  // 耐久
  price?: string;       // 價格
  stats?: Record<string, string>;        // 附加能力 (equipment)
  requirements?: Record<string, string>; // 需求能力 (equipment)
}
```

### Character Interface Updates
- Add `items?: CharacterItem[]` to Character interface
- Keep backward compat with existing `weapon`/`equipment` fields
- Component: prefer `items` array, fallback to legacy fields

### Data Fixes
- Add missing fields (成份, 消耗, 價格) to existing weapon/equipment data
- Add `equipments` array for Stinky transform (納米亞笛, 爺爺的手記, 新生星奇服裝)
- Re-extract from original HTML where needed

## Files to Modify
- `lib/characters.ts` — add CharacterItem type, update Character interface
- `components/character-stand-card.tsx` — new weapon/equipment rendering
- `data/characters.json` — add missing fields, multi-item data
- `data/transforms.json` — add Stinky transform equipment

## Out of Scope
- Re-extracting all characters from scratch (manual fixes only)
- Weapon/equipment detail pages
- Item comparison features
