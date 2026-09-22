import type { Check, Match, Project, Verdict, Yarn } from './types';
import { adjacentNeedle, estimatedGauge, weightFromWpi, weightSpec } from './weights';

/**
 * Knitters run out of yarn. Buying the requirement exactly leaves nothing for
 * swatching, a longer body, or a dye lot that ran short, so every match holds
 * back a margin before it calls a yarn sufficient.
 */
export const YARDAGE_SAFETY_MARGIN = 1.15;

/**
 * Gauge within this fraction of the pattern's is a clean match. One stitch per
 * four inches compounds into inches across a garment, so the clean band is
 * tight and anything past it earns a swatch warning rather than a pass.
 */
const GAUGE_PASS_TOLERANCE = 0.05;
/** Beyond this, no needle change rescues it. */
const GAUGE_WARN_TOLERANCE = 0.2;

/** Fibers that are wool, or close enough to trigger the same allergy. */
const ANIMAL_FIBER = /\b(wool|merino|alpaca|mohair|cashmere|angora|yak|llama|camel|bfl|blue[- ]faced|corriedale|shetland|romney|targhee|rambouillet|qiviut)\b/i;

/** Total yards on hand, full skeins plus any measured leftovers. */
export function availableYards(yarn: Yarn): number {
  return yarn.skeins * yarn.yardsPerSkein + (yarn.partialYards ?? 0);
}

/** The band's gauge when it has one, otherwise the weight class midpoint. */
function effectiveGauge(yarn: Yarn): { value: number; estimated: boolean } {
  if (yarn.gaugeStsPer4in) return { value: yarn.gaugeStsPer4in, estimated: false };
  if (yarn.wpi) {
    const fromWpi = weightFromWpi(yarn.wpi);
    if (fromWpi !== undefined) return { value: estimatedGauge(fromWpi), estimated: true };
  }
  return { value: estimatedGauge(yarn.weightClass), estimated: true };
}

function checkWeight(yarn: Yarn, project: Project): Check {
  const distance = Math.abs(yarn.weightClass - project.weightClass);
  const yarnName = weightSpec(yarn.weightClass).name;
  const wantName = weightSpec(project.weightClass).name;

  if (distance === 0) {
    return { id: 'weight', label: 'Weight', status: 'pass', detail: `${yarnName} (CYC ${yarn.weightClass}), exactly what the pattern calls for.` };
  }
  if (distance === 1) {
    return { id: 'weight', label: 'Weight', status: 'warn', detail: `${yarnName} against ${wantName} — one class off.` };
  }
  return {
    id: 'weight',
    label: 'Weight',
    status: 'fail',
    detail: `${yarnName} against ${wantName} — ${distance} classes apart.`,
  };
}

function checkGauge(yarn: Yarn, project: Project): Check {
  if (!project.gaugeStsPer4in) {
    return { id: 'gauge', label: 'Gauge', status: 'pass', detail: 'No gauge recorded for this project, so weight class decides it.' };
  }

  const { value, estimated } = effectiveGauge(yarn);
  const drift = Math.abs(value - project.gaugeStsPer4in) / project.gaugeStsPer4in;
  const source = estimated ? 'estimated from its weight class' : 'from the band';
  const summary = `${value} sts/4" ${source} against ${project.gaugeStsPer4in} called for`;

  if (drift <= GAUGE_PASS_TOLERANCE) {
    return { id: 'gauge', label: 'Gauge', status: 'pass', detail: `${summary}.`, estimated };
  }

  // Fewer stitches means a thicker yarn, which a smaller needle pulls back in.
  const direction = value < project.gaugeStsPer4in ? 'down' : 'up';
  const suggested = suggestNeedle(project, direction);
  if (drift <= GAUGE_WARN_TOLERANCE) {
    return {
      id: 'gauge',
      label: 'Gauge',
      status: 'warn',
      detail: `${summary}. Swatch on a needle one size ${direction}${suggested ? ` (try a US ${suggested})` : ''}.`,
      estimated,
    };
  }
  return {
    id: 'gauge',
    label: 'Gauge',
    status: 'fail',
    detail: `${summary}. Too far apart for needle size to rescue.`,
    estimated,
  };
}

function suggestNeedle(project: Project, direction: 'up' | 'down'): string | undefined {
  const base = project.needleSizeMm ?? weightSpec(project.weightClass).needleMm[0];
  return adjacentNeedle(base, direction)?.us;
}

function checkYardage(yarn: Yarn, project: Project): { check: Check; shortfall?: number; skeinsShort?: number } {
  const have = availableYards(yarn);
  const withMargin = Math.ceil(project.yardsNeeded * YARDAGE_SAFETY_MARGIN);

  if (have >= withMargin) {
    return {
      check: {
        id: 'yardage',
        label: 'Yardage',
        status: 'pass',
        detail: `${have.toLocaleString()} yd on hand against ${project.yardsNeeded.toLocaleString()} yd needed — ${(have - project.yardsNeeded).toLocaleString()} yd clear.`,
      },
    };
  }

  if (have >= project.yardsNeeded) {
    return {
      check: {
        id: 'yardage',
        label: 'Yardage',
        status: 'warn',
        detail: `${have.toLocaleString()} yd covers the ${project.yardsNeeded.toLocaleString()} yd called for, but leaves nothing for swatching or a longer body.`,
      },
    };
  }

  const shortfall = withMargin - have;
  const skeinsShort = Math.ceil(shortfall / yarn.yardsPerSkein);
  return {
    check: {
      id: 'yardage',
      label: 'Yardage',
      status: 'fail',
      detail: `${have.toLocaleString()} yd on hand, ${shortfall.toLocaleString()} yd short of a safe ${withMargin.toLocaleString()} yd. About ${skeinsShort} more skein${skeinsShort === 1 ? '' : 's'}.`,
    },
    shortfall,
    skeinsShort,
  };
}

function checkFiber(yarn: Yarn, project: Project): Check {
  const fiber = yarn.fiber || 'unspecified fiber';

  if (project.noWool && ANIMAL_FIBER.test(fiber)) {
    return { id: 'fiber', label: 'Fiber', status: 'fail', detail: `${fiber} — this project is marked no wool.` };
  }
  if (project.needsSuperwash && !yarn.superwash) {
    return { id: 'fiber', label: 'Fiber', status: 'fail', detail: `${fiber}, not superwash. This project has to survive a washing machine.` };
  }
  // Superwash is treated so the scales cannot lock together, which is the whole
  // mechanism felting depends on.
  if (project.needsFeltable && yarn.superwash) {
    return { id: 'fiber', label: 'Fiber', status: 'fail', detail: `Superwash ${fiber} will not felt.` };
  }
  if (project.needsFeltable && !ANIMAL_FIBER.test(fiber)) {
    return { id: 'fiber', label: 'Fiber', status: 'fail', detail: `${fiber} has no scales to felt.` };
  }
  if (project.needsSuperwash && yarn.superwash) {
    return { id: 'fiber', label: 'Fiber', status: 'pass', detail: `Superwash ${fiber} — machine washable, as this project needs.` };
  }
  return { id: 'fiber', label: 'Fiber', status: 'pass', detail: `${fiber} — nothing on this project rules it out.` };
}

function verdictFrom(checks: Check[]): Verdict {
  if (checks.some((c) => c.status === 'fail')) return 'no';
  if (checks.some((c) => c.status === 'warn')) return 'close';
  return 'works';
}

/**
 * A knitter needs the reason more than the verdict — the fix lives in the
 * reason. Lead with what failed, fall back to what to watch, and only say
 * everything lines up when it genuinely does.
 */
function explain(checks: Check[], verdict: Verdict): string {
  const failures = checks.filter((c) => c.status === 'fail');
  if (failures.length > 0) return failures.map((c) => c.detail).join(' ');

  const warnings = checks.filter((c) => c.status === 'warn');
  if (warnings.length > 0) return warnings.map((c) => c.detail).join(' ');

  const yardage = checks.find((c) => c.id === 'yardage');
  return verdict === 'works' && yardage
    ? `Weight, gauge and fiber all line up. ${yardage.detail}`
    : 'Weight, gauge, yardage and fiber all line up.';
}

/** Run one yarn against one project. */
export function matchYarnToProject(yarn: Yarn, project: Project): Match {
  const yardage = checkYardage(yarn, project);
  const checks: Check[] = [
    checkWeight(yarn, project),
    checkGauge(yarn, project),
    yardage.check,
    checkFiber(yarn, project),
  ];
  const verdict = verdictFrom(checks);

  return {
    yarnId: yarn.id,
    projectId: project.id,
    verdict,
    checks,
    reason: explain(checks, verdict),
    availableYards: availableYards(yarn),
    shortfallYards: yardage.shortfall,
    skeinsShort: yardage.skeinsShort,
  };
}

const VERDICT_ORDER: Record<Verdict, number> = { works: 0, close: 1, no: 2 };

/** Every yarn in the stash against one project, best first. */
export function matchStashToProject(stash: Yarn[], project: Project): Match[] {
  return stash
    .map((yarn) => matchYarnToProject(yarn, project))
    .sort((a, b) => {
      const byVerdict = VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict];
      return byVerdict !== 0 ? byVerdict : b.availableYards - a.availableYards;
    });
}

/** Every project this one yarn could finish — the answer to "what can I make with this?". */
export function matchYarnToProjects(yarn: Yarn, projects: Project[]): Match[] {
  return projects
    .map((project) => matchYarnToProject(yarn, project))
    .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]);
}
