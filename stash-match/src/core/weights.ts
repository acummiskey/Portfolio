import type { WeightClass } from './types';

export interface WeightSpec {
  cyc: WeightClass;
  name: string;
  /** Common names a ball band or pattern actually prints. */
  aliases: string[];
  /** Craft Yarn Council stockinette gauge range, stitches per 4 inches. */
  gauge: [min: number, max: number];
  /** Recommended needle range in millimetres. */
  needleMm: [min: number, max: number];
  /** Wraps per inch range, for yarn measured by hand off a swift. */
  wpi: [min: number, max: number];
}

/** The Craft Yarn Council standard yarn weight system. */
export const WEIGHTS: readonly WeightSpec[] = [
  { cyc: 0, name: 'Lace',        aliases: ['lace', 'cobweb', 'thread', '2-ply', 'light fingering'], gauge: [33, 40], needleMm: [1.5, 2.25],  wpi: [30, 40] },
  { cyc: 1, name: 'Super Fine',  aliases: ['fingering', 'sock', 'baby', '4-ply'],                   gauge: [27, 32], needleMm: [2.25, 3.25], wpi: [19, 22] },
  { cyc: 2, name: 'Fine',        aliases: ['sport', 'baby'],                                        gauge: [23, 26], needleMm: [3.25, 3.75], wpi: [15, 18] },
  { cyc: 3, name: 'Light',       aliases: ['dk', 'light worsted', '8-ply'],                          gauge: [21, 24], needleMm: [3.75, 4.5],  wpi: [12, 14] },
  { cyc: 4, name: 'Medium',      aliases: ['worsted', 'aran', 'afghan', '10-ply'],                   gauge: [16, 20], needleMm: [4.5, 5.5],   wpi: [9, 11] },
  { cyc: 5, name: 'Bulky',       aliases: ['chunky', 'craft', 'rug', '12-ply'],                      gauge: [12, 15], needleMm: [5.5, 8],     wpi: [7, 8] },
  { cyc: 6, name: 'Super Bulky', aliases: ['super chunky', 'roving'],                                gauge: [7, 11],  needleMm: [8, 12.75],   wpi: [5, 6] },
  { cyc: 7, name: 'Jumbo',       aliases: ['jumbo', 'roving'],                                       gauge: [1, 6],   needleMm: [12.75, 25],  wpi: [1, 4] },
] as const;

const BY_CLASS = Object.fromEntries(WEIGHTS.map((spec) => [spec.cyc, spec])) as Record<WeightClass, WeightSpec>;

export function weightSpec(cyc: WeightClass): WeightSpec {
  return BY_CLASS[cyc];
}

/** "DK" / "worsted" / "3" off a ball band or a pattern's materials list. */
export function parseWeight(input: string): WeightClass | undefined {
  const text = input.trim().toLowerCase();
  const asNumber = Number(text);
  if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 7) {
    return asNumber as WeightClass;
  }
  for (const spec of WEIGHTS) {
    if (spec.name.toLowerCase() === text) return spec.cyc;
    if (spec.aliases.includes(text)) return spec.cyc;
  }
  return undefined;
}

/** Midpoint of a class's gauge range — used when a band omits its gauge. */
export function estimatedGauge(cyc: WeightClass): number {
  const [min, max] = weightSpec(cyc).gauge;
  return Math.round((min + max) / 2);
}

/**
 * Wraps per inch, measured by winding yarn around a ruler, is the fallback
 * when a yarn has lost its band entirely.
 */
export function weightFromWpi(wpi: number): WeightClass | undefined {
  const found = WEIGHTS.find((spec) => wpi >= spec.wpi[0] && wpi <= spec.wpi[1]);
  return found?.cyc;
}

/** US needle sizes keyed by millimetre, for advice the knitter can act on. */
const US_NEEDLES: ReadonlyArray<readonly [mm: number, us: string]> = [
  [2.25, '1'], [2.75, '2'], [3.25, '3'], [3.5, '4'], [3.75, '5'], [4, '6'],
  [4.5, '7'], [5, '8'], [5.5, '9'], [6, '10'], [6.5, '10.5'], [8, '11'],
  [9, '13'], [10, '15'], [12.75, '17'], [15, '19'], [19, '35'], [25, '50'],
];

/**
 * The next needle up or down the US range. Stepping by a flat half-millimetre
 * skips sizes at the fine end and lands between them at the bulky end, so
 * advice like "one size down" has to walk the real ladder.
 */
export function adjacentNeedle(mm: number, direction: 'up' | 'down'): { mm: number; us: string } | undefined {
  let nearest = 0;
  for (let i = 1; i < US_NEEDLES.length; i += 1) {
    if (Math.abs(US_NEEDLES[i]![0] - mm) < Math.abs(US_NEEDLES[nearest]![0] - mm)) nearest = i;
  }
  const next = US_NEEDLES[nearest + (direction === 'up' ? 1 : -1)];
  return next ? { mm: next[0], us: next[1] } : undefined;
}

export function usNeedleSize(mm: number): string | undefined {
  let best: { us: string; distance: number } | undefined;
  for (const [size, us] of US_NEEDLES) {
    const distance = Math.abs(size - mm);
    if (distance < 0.26 && (!best || distance < best.distance)) best = { us, distance };
  }
  return best?.us;
}
