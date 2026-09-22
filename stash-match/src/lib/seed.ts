import type { Project, Yarn } from '../core/types';
import type { StashState } from './storage';

/**
 * A first-run stash, so the app opens showing what it does rather than an empty
 * shell. Specifications are real; these are not the knitter's own skeins.
 */
export const SEED: StashState = {
  yarns: [
    {
      id: 'seed_swish', brand: 'Knit Picks', name: 'Swish DK', colorway: 'Dove Heather',
      dyeLot: '24118', fiber: '100% superwash merino wool', weightClass: 3,
      yardsPerSkein: 123, gramsPerSkein: 50, skeins: 11, gaugeStsPer4in: 22,
      needleSizeMm: 4, superwash: true, createdAt: 1,
    },
    {
      id: 'seed_cascade', brand: 'Cascade', name: '220', colorway: 'Aran 8010',
      dyeLot: 'A7213', fiber: '100% Peruvian highland wool', weightClass: 4,
      yardsPerSkein: 220, gramsPerSkein: 100, skeins: 6, partialYards: 60,
      gaugeStsPer4in: 20, needleSizeMm: 4.5, superwash: false, createdAt: 2,
      notes: 'Sixty yards left from the 2024 hat.',
    },
    {
      id: 'seed_sock', brand: 'Malabrigo', name: 'Sock', colorway: 'Arco Iris',
      fiber: '100% superwash merino wool', weightClass: 1, yardsPerSkein: 440,
      gramsPerSkein: 100, skeins: 4, gaugeStsPer4in: 28, needleSizeMm: 3.25,
      superwash: true, createdAt: 3,
    },
    {
      id: 'seed_dishie', brand: 'Knit Picks', name: 'Dishie', colorway: 'Swan',
      fiber: '100% cotton', weightClass: 4, yardsPerSkein: 190, gramsPerSkein: 100,
      skeins: 5, gaugeStsPer4in: 19, needleSizeMm: 4.5, superwash: false, createdAt: 4,
    },
  ] satisfies Yarn[],
  projects: [
    {
      id: 'seed_ranunculus', name: 'Ranunculus pullover, size 3',
      weightClass: 3, yardsNeeded: 1150, gaugeStsPer4in: 22, needleSizeMm: 4, createdAt: 1,
    },
    {
      id: 'seed_blanket', name: "Baby blanket for Dana's shower",
      weightClass: 3, yardsNeeded: 900, gaugeStsPer4in: 22, needleSizeMm: 4,
      needsSuperwash: true, createdAt: 2,
    },
    {
      id: 'seed_slippers', name: 'Felted clogs',
      weightClass: 4, yardsNeeded: 380, gaugeStsPer4in: 18, needleSizeMm: 5.5,
      needsFeltable: true, createdAt: 3,
    },
  ] satisfies Project[],
};
