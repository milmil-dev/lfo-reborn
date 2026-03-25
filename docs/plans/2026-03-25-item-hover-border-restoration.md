# Design: Restore Hovered Borders to Item Cards and Preview

## Purpose
The item cards in the grid and the side hover preview popup recently had their border styles removed or significantly reduced in opacity. This change addresses the loss of visual hierarchy and interaction feedback by restoring these borders using consistent, modern opacities.

## Approach
Restore the borders using the "Balanced & Modern" approach. This provides clear feedback without distracting from the content, aligning with the "museum-style" aesthetic used for characters and beasts in the wiki.

### Core Components

#### 1. `ItemCard` (Grid items)
- Increase the hover border intensity to make the selected item stand out more in the dense grid.
- **Change:** `hover:border-fd-primary/30` -> `hover:border-fd-primary/45`.

#### 2. `HoverCardShell` (Preview popup)
- Restore the border that was completely removed in recent styling updates.
- **Change:** Add `border border-fd-primary/35` to the main container.
- **Why:** The preview popup is floating and needs a border to clearly define its boundaries against the blurred background.

## Verification Plan
1.  **Visual Inspection (Grid):** Hover over multiple items in the items table. The border should be clearly visible but not harsh.
2.  **Visual Inspection (Popup):** Hover over an item and check the side preview. It should have a subtle but distinct border.
3.  **Rarity check:** Verify that rare items still maintain their amber accents and that the primary border restoration doesn't conflict with them.
