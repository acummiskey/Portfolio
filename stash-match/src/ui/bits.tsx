import type { ReactNode } from 'react';
import type { Check, Verdict, WeightClass, Yarn } from '../core/types';
import { WEIGHTS, weightSpec } from '../core/weights';

const VERDICT_TEXT: Record<Verdict, string> = { works: 'Works', close: 'Close', no: 'No' };
const MARK: Record<Check['status'], string> = { pass: '✓', warn: '!', fail: '✕' };

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return <span className="pill">{VERDICT_TEXT[verdict]}</span>;
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checks">
      {checks.map((check) => (
        <li key={check.id} className={check.status}>
          <span className="mark" aria-hidden="true">{MARK[check.status]}</span>
          <span className="name">{check.label}</span>
          <span className="detail">
            {check.detail}
            {check.estimated ? <span className="est"> Estimated.</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One line of ball-band data: fiber, put-up, gauge, dye lot. */
export function YarnSpec({ yarn }: { yarn: Yarn }) {
  const parts = [
    yarn.fiber,
    `${yarn.yardsPerSkein} yd${yarn.gramsPerSkein ? ` / ${yarn.gramsPerSkein} g` : ''}`,
    `${yarn.skeins} skein${yarn.skeins === 1 ? '' : 's'}`,
    yarn.partialYards ? `+ ${yarn.partialYards} yd left over` : null,
    `${weightSpec(yarn.weightClass).name} (CYC ${yarn.weightClass})`,
    yarn.gaugeStsPer4in ? `${yarn.gaugeStsPer4in} sts/4"` : null,
    yarn.dyeLot ? `lot ${yarn.dyeLot}` : null,
  ].filter(Boolean);
  return <div className="spec">{parts.join(' · ')}</div>;
}

interface FieldProps {
  label: string;
  note?: string;
  flagged?: boolean;
  children: ReactNode;
}

export function Field({ label, note, flagged, children }: FieldProps) {
  return (
    <label className={`field${flagged ? ' flagged' : ''}`}>
      <span>{label}</span>
      {children}
      {note ? <span className="field-note">{note}</span> : null}
    </label>
  );
}

export function WeightSelect({
  value,
  onChange,
  id,
}: {
  value: WeightClass;
  onChange: (value: WeightClass) => void;
  id: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value) as WeightClass)}>
      {WEIGHTS.map((spec) => (
        <option key={spec.cyc} value={spec.cyc}>
          {spec.cyc} — {spec.name} ({spec.aliases[0]})
        </option>
      ))}
    </select>
  );
}
