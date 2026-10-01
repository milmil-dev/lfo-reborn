/*
  招式等級 (system/skilllv.mdx): a special gets stronger the more it is used. The client kept
  each move's experience on the server and the notes give no numbers, so the remake's reading:
  every use is one point; 10 / 40 / 100 / 250 points reach LV 2 / 3 / 4 / 5, and each level past
  the first adds 6 % to the move's damage (its projectiles too).
*/

export const SKILL_STEPS = [0, 10, 40, 100, 250];
export const SKILL_MAX = SKILL_STEPS.length;

export function skillLevel(exp: number) {
  let lv = 1;
  for (let i = 1; i < SKILL_STEPS.length; i++) if (exp >= SKILL_STEPS[i]) lv = i + 1;
  return lv;
}

/** Points still needed for the next level (0 at the top). */
export const skillToNext = (exp: number) => {
  const lv = skillLevel(exp);
  return lv >= SKILL_MAX ? 0 : SKILL_STEPS[lv] - exp;
};

export const skillBonus = (lv: number) => 1 + 0.06 * (Math.max(1, lv) - 1);
