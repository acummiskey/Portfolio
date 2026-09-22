/** Craft Yarn Council standard yarn weight classes, 0 (lace) through 7 (jumbo). */
export type WeightClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A yarn the user owns, as captured from a ball band. */
export interface Yarn {
  id: string;
  brand: string;
  name: string;
  colorway?: string;
  /** Dye lots do not match across skeins. First-class from day one. */
  dyeLot?: string;
  fiber: string;
  weightClass: WeightClass;
  yardsPerSkein: number;
  gramsPerSkein?: number;
  skeins: number;
  /** Leftovers from a finished project, in yards. */
  partialYards?: number;
  /** Stitches per 4 inches, as printed on the band. */
  gaugeStsPer4in?: number;
  /** Wraps per inch, measured by hand when the band is missing. */
  wpi?: number;
  needleSizeMm?: number;
  superwash?: boolean;
  photo?: string;
  notes?: string;
  createdAt: number;
}

/** What a project needs before it can be knit. */
export interface Project {
  id: string;
  name: string;
  weightClass: WeightClass;
  yardsNeeded: number;
  gaugeStsPer4in?: number;
  needleSizeMm?: number;
  /** Must survive a washing machine — anything for a baby or a gift. */
  needsSuperwash?: boolean;
  /** Wearer is allergic, or the project is for someone who asked for no animal fiber. */
  noWool?: boolean;
  /** Project is felted on purpose, so superwash will not do. */
  needsFeltable?: boolean;
  createdAt: number;
}

export type Verdict = 'works' | 'close' | 'no';
export type CheckStatus = 'pass' | 'warn' | 'fail';
export type CheckId = 'weight' | 'gauge' | 'yardage' | 'fiber';

export interface Check {
  id: CheckId;
  label: string;
  status: CheckStatus;
  detail: string;
  /** True when the value came from the weight class rather than the band. */
  estimated?: boolean;
}

export interface Match {
  yarnId: string;
  projectId: string;
  verdict: Verdict;
  checks: Check[];
  /** One plain-English sentence explaining the verdict. */
  reason: string;
  availableYards: number;
  /** Set when the yardage check fails: how many yards short. */
  shortfallYards?: number;
  /** Set when short: how many more skeins would close the gap. */
  skeinsShort?: number;
}

/** What the label extractor returns before the user confirms it. */
export interface YarnDraft {
  brand?: string;
  name?: string;
  colorway?: string;
  dyeLot?: string;
  fiber?: string;
  weightClass?: WeightClass;
  yardsPerSkein?: number;
  gramsPerSkein?: number;
  gaugeStsPer4in?: number;
  needleSizeMm?: number;
  superwash?: boolean;
  /** Fields the model could not read off the band, so the user must fill them in. */
  unreadable?: string[];
}
