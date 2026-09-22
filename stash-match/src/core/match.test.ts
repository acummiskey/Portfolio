import { describe, expect, it } from 'vitest';
import { availableYards, matchStashToProject, matchYarnToProject, YARDAGE_SAFETY_MARGIN } from './match';
import { estimatedGauge, parseWeight, usNeedleSize, weightFromWpi } from './weights';
import type { Project, Yarn } from './types';

function yarn(overrides: Partial<Yarn> = {}): Yarn {
  return {
    id: 'y1', brand: 'Knit Picks', name: 'Swish DK', fiber: '100% superwash merino',
    weightClass: 3, yardsPerSkein: 123, gramsPerSkein: 50, skeins: 11,
    gaugeStsPer4in: 22, needleSizeMm: 4, superwash: true, createdAt: 0,
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: 'Ranunculus pullover, size 3',
    weightClass: 3, yardsNeeded: 1150, gaugeStsPer4in: 22, needleSizeMm: 4,
    createdAt: 0,
    ...overrides,
  };
}

describe('weight tables', () => {
  it('parses the names ball bands and patterns actually print', () => {
    expect(parseWeight('DK')).toBe(3);
    expect(parseWeight('worsted')).toBe(4);
    expect(parseWeight('Fingering')).toBe(1);
    expect(parseWeight('4')).toBe(4);
    expect(parseWeight('handspun something')).toBeUndefined();
  });

  it('derives a weight class from wraps per inch', () => {
    expect(weightFromWpi(13)).toBe(3);
    expect(weightFromWpi(10)).toBe(4);
    expect(weightFromWpi(20)).toBe(1);
  });

  it('estimates gauge at the midpoint of a class', () => {
    expect(estimatedGauge(3)).toBe(23);
    expect(estimatedGauge(4)).toBe(18);
  });

  it('converts millimetres to US needle sizes', () => {
    expect(usNeedleSize(4)).toBe('6');
    expect(usNeedleSize(5)).toBe('8');
  });
});

describe('yardage', () => {
  it('counts full skeins plus measured leftovers', () => {
    expect(availableYards(yarn({ skeins: 3, yardsPerSkein: 100, partialYards: 45 }))).toBe(345);
  });

  it('passes when the stash clears the pattern plus the safety margin', () => {
    const m = matchYarnToProject(yarn(), project());
    expect(m.checks.find((c) => c.id === 'yardage')?.status).toBe('pass');
    expect(m.verdict).toBe('works');
  });

  it('warns when the yardage covers the pattern but leaves no margin', () => {
    // 1,150 yd needed, so 1,323 yd is the safe number; 1,200 covers but not safely.
    const m = matchYarnToProject(yarn({ skeins: 10, yardsPerSkein: 120 }), project());
    expect(m.checks.find((c) => c.id === 'yardage')?.status).toBe('warn');
    expect(m.verdict).toBe('close');
  });

  it('fails short yardage and says how many more skeins to buy', () => {
    const m = matchYarnToProject(yarn({ skeins: 6 }), project());
    expect(m.verdict).toBe('no');
    expect(m.shortfallYards).toBe(Math.ceil(1150 * YARDAGE_SAFETY_MARGIN) - 738);
    expect(m.skeinsShort).toBe(5);
    expect(m.reason).toContain('5 more skeins');
  });

  it('uses the singular when exactly one skein closes the gap', () => {
    // 1,200 yd on hand, under the 1,250 called for and 238 yd under the safe
    // 1,438 — a gap one 400 yd skein closes.
    const m = matchYarnToProject(yarn({ skeins: 3, yardsPerSkein: 400 }), project({ yardsNeeded: 1250 }));
    expect(m.skeinsShort).toBe(1);
    expect(m.reason).toContain('1 more skein.');
  });
});

describe('weight and gauge', () => {
  it('calls one class off close, not a match', () => {
    // Cascade 220: worsted, 220 yd/100g, 20 sts/4in.
    const cascade = yarn({
      id: 'y2', brand: 'Cascade', name: '220', fiber: '100% Peruvian highland wool',
      weightClass: 4, yardsPerSkein: 220, gramsPerSkein: 100, skeins: 6,
      gaugeStsPer4in: 20, needleSizeMm: 4.5, superwash: false,
    });
    const m = matchYarnToProject(cascade, project());
    expect(m.verdict).toBe('close');
    expect(m.checks.find((c) => c.id === 'weight')?.status).toBe('warn');
    expect(m.reason).toContain('one size down');
  });

  it('rejects two classes off even when the yardage is ample', () => {
    // Malabrigo Sock: fingering, 440 yd/100g.
    const sock = yarn({
      id: 'y3', brand: 'Malabrigo', name: 'Sock', fiber: '100% superwash merino',
      weightClass: 1, yardsPerSkein: 440, skeins: 4, gaugeStsPer4in: 28,
    });
    const m = matchYarnToProject(sock, project());
    expect(m.verdict).toBe('no');
    expect(m.checks.find((c) => c.id === 'yardage')?.status).toBe('pass');
    expect(m.checks.find((c) => c.id === 'weight')?.status).toBe('fail');
  });

  it('marks gauge as estimated when the band did not carry one', () => {
    const m = matchYarnToProject(yarn({ gaugeStsPer4in: undefined }), project());
    const gauge = m.checks.find((c) => c.id === 'gauge');
    expect(gauge?.estimated).toBe(true);
    expect(gauge?.detail).toContain('estimated from its weight class');
  });

  it('falls back to wraps per inch when the band is gone', () => {
    const m = matchYarnToProject(yarn({ gaugeStsPer4in: undefined, wpi: 13 }), project());
    expect(m.checks.find((c) => c.id === 'gauge')?.status).toBe('pass');
  });

  it('ignores gauge when the project never recorded one', () => {
    const m = matchYarnToProject(yarn({ gaugeStsPer4in: 26 }), project({ gaugeStsPer4in: undefined }));
    expect(m.checks.find((c) => c.id === 'gauge')?.status).toBe('pass');
  });
});

describe('fiber rules', () => {
  it('blocks non-superwash for anything that must be machine washable', () => {
    const m = matchYarnToProject(yarn({ superwash: false }), project({ needsSuperwash: true }));
    expect(m.verdict).toBe('no');
    expect(m.reason).toContain('washing machine');
  });

  it('blocks animal fiber when the project is marked no wool', () => {
    const m = matchYarnToProject(yarn({ fiber: '70% baby alpaca, 30% silk' }), project({ noWool: true }));
    expect(m.verdict).toBe('no');
    expect(m.reason).toContain('no wool');
  });

  it('lets plant fiber through a no-wool project', () => {
    const m = matchYarnToProject(yarn({ fiber: '100% pima cotton', superwash: false }), project({ noWool: true }));
    expect(m.checks.find((c) => c.id === 'fiber')?.status).toBe('pass');
  });

  it('blocks superwash from a project that is meant to felt', () => {
    const m = matchYarnToProject(yarn({ superwash: true }), project({ needsFeltable: true }));
    expect(m.verdict).toBe('no');
    expect(m.reason).toContain('will not felt');
  });

  it('blocks plant fiber from a felted project', () => {
    const m = matchYarnToProject(yarn({ fiber: '100% cotton', superwash: false }), project({ needsFeltable: true }));
    expect(m.reason).toContain('no scales to felt');
  });
});

describe('ranking', () => {
  it('sorts works before close before no, then by yardage', () => {
    const stash = [
      yarn({ id: 'no', weightClass: 1, gaugeStsPer4in: 28 }),
      yarn({ id: 'close', weightClass: 4, gaugeStsPer4in: 20, yardsPerSkein: 220, skeins: 6 }),
      yarn({ id: 'works' }),
    ];
    expect(matchStashToProject(stash, project()).map((m) => m.yarnId)).toEqual(['works', 'close', 'no']);
  });

  it('reports every check on every match, whatever the verdict', () => {
    for (const m of matchStashToProject([yarn(), yarn({ id: 'y2', weightClass: 6 })], project())) {
      expect(m.checks.map((c) => c.id)).toEqual(['weight', 'gauge', 'yardage', 'fiber']);
      expect(m.reason.length).toBeGreaterThan(0);
    }
  });
});
