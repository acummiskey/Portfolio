import { useState } from 'react';
import type { Match, Project, Verdict, WeightClass, Yarn } from '../core/types';
import { matchStashToProject, matchYarnToProjects } from '../core/match';
import { weightSpec } from '../core/weights';
import { CheckList, Field, VerdictPill, WeightSelect, YarnSpec } from './bits';
import { newId } from '../lib/storage';

/** Shows which projects one yarn could finish — "what can I make with this?". */
function YarnCard({ yarn, projects, onRemove }: { yarn: Yarn; projects: Project[]; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const matches = matchYarnToProjects(yarn, projects);
  const usable = matches.filter((m) => m.verdict !== 'no').length;

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">{yarn.brand ? `${yarn.brand} ${yarn.name}` : yarn.name}</h3>
        {yarn.colorway ? <span className="spec">{yarn.colorway}</span> : null}
        <div className="card-actions">
          <button type="button" className="btn btn-quiet" onClick={() => setOpen(!open)} aria-expanded={open}>
            {usable} of {projects.length} projects
          </button>
          <button type="button" className="btn btn-quiet" onClick={onRemove} aria-label={`Remove ${yarn.name}`}>
            Remove
          </button>
        </div>
      </div>
      <YarnSpec yarn={yarn} />
      {open ? (
        <ul className="checks" style={{ gridTemplateColumns: '1fr' }}>
          {matches.map((match) => {
            const project = projects.find((p) => p.id === match.projectId);
            return (
              <li key={match.projectId} className={match.verdict} style={{ display: 'block' }}>
                <div className="card-head">
                  <strong style={{ fontSize: '0.9rem' }}>{project?.name}</strong>
                  <span className="card-actions"><VerdictPill verdict={match.verdict} /></span>
                </div>
                <p className="reason" style={{ marginTop: 4 }}>{match.reason}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

export function StashView({
  yarns, projects, onScan, onRemove,
}: {
  yarns: Yarn[]; projects: Project[]; onScan: () => void; onRemove: (id: string) => void;
}) {
  return (
    <div>
      <p className="eyebrow">Stash · {yarns.length} yarns</p>
      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onScan} style={{ marginBottom: 16 }}>
        Scan a ball band
      </button>
      {yarns.length === 0 ? (
        <p className="empty">Nothing in the stash yet. Photograph a band to add the first one.</p>
      ) : (
        yarns.map((yarn) => (
          <YarnCard key={yarn.id} yarn={yarn} projects={projects} onRemove={() => onRemove(yarn.id)} />
        ))
      )}
    </div>
  );
}

const EMPTY_PROJECT = {
  name: '', weightClass: 3 as WeightClass, yardsNeeded: 0, gaugeStsPer4in: 0,
  needsSuperwash: false, noWool: false, needsFeltable: false,
};

export function ProjectsView({
  projects, yarns, onAdd, onRemove,
}: {
  projects: Project[]; yarns: Yarn[]; onAdd: (project: Project) => void; onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PROJECT);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onAdd({
      id: newId('p'),
      name: draft.name.trim() || 'Untitled project',
      weightClass: draft.weightClass,
      yardsNeeded: Number(draft.yardsNeeded) || 0,
      gaugeStsPer4in: Number(draft.gaugeStsPer4in) || undefined,
      needsSuperwash: draft.needsSuperwash,
      noWool: draft.noWool,
      needsFeltable: draft.needsFeltable,
      createdAt: Date.now(),
    });
    setDraft(EMPTY_PROJECT);
    setAdding(false);
  }

  return (
    <div>
      <p className="eyebrow">Projects · {projects.length} queued</p>

      {adding ? (
        <form onSubmit={submit} className="card" style={{ marginBottom: 16 }}>
          <Field label="Project">
            <input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ranunculus pullover, size 3" required />
          </Field>
          <Field label="Yarn weight the pattern calls for">
            <WeightSelect id="p-weight" value={draft.weightClass} onChange={(v) => setDraft({ ...draft, weightClass: v })} />
          </Field>
          <div className="grid-2">
            <Field label="Yards needed">
              <input id="p-yards" type="number" min="0" value={draft.yardsNeeded || ''} onChange={(e) => setDraft({ ...draft, yardsNeeded: Number(e.target.value) })} required />
            </Field>
            <Field label='Gauge, sts/4"' note="Optional.">
              <input id="p-gauge" type="number" min="0" value={draft.gaugeStsPer4in || ''} onChange={(e) => setDraft({ ...draft, gaugeStsPer4in: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="check-field" htmlFor="p-superwash">
            <input id="p-superwash" type="checkbox" checked={draft.needsSuperwash} onChange={(e) => setDraft({ ...draft, needsSuperwash: e.target.checked })} />
            Has to be machine washable
          </label>
          <label className="check-field" htmlFor="p-nowool">
            <input id="p-nowool" type="checkbox" checked={draft.noWool} onChange={(e) => setDraft({ ...draft, noWool: e.target.checked })} />
            No wool — allergy or preference
          </label>
          <label className="check-field" htmlFor="p-felt">
            <input id="p-felt" type="checkbox" checked={draft.needsFeltable} onChange={(e) => setDraft({ ...draft, needsFeltable: e.target.checked })} />
            Gets felted
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">Add project</button>
            <button type="button" className="btn btn-quiet" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => setAdding(true)} style={{ marginBottom: 16 }}>
          Add a project
        </button>
      )}

      {projects.length === 0 ? (
        <p className="empty">No projects yet. Add one and your stash gets matched against it.</p>
      ) : (
        projects.map((project) => {
          const works = matchStashToProject(yarns, project).filter((m) => m.verdict === 'works').length;
          return (
            <article key={project.id} className="card">
              <div className="card-head">
                <h3 className="card-title">{project.name}</h3>
                <div className="card-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => onRemove(project.id)} aria-label={`Remove ${project.name}`}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="spec">
                {[
                  `${weightSpec(project.weightClass).name} (CYC ${project.weightClass})`,
                  `${project.yardsNeeded.toLocaleString()} yd`,
                  project.gaugeStsPer4in ? `${project.gaugeStsPer4in} sts/4"` : null,
                  project.needsSuperwash ? 'superwash only' : null,
                  project.noWool ? 'no wool' : null,
                  project.needsFeltable ? 'felted' : null,
                ].filter(Boolean).join(' · ')}
              </div>
              <p className="reason">
                {works > 0
                  ? `${works} yarn${works === 1 ? '' : 's'} in your stash can finish this.`
                  : 'Nothing in your stash finishes this yet.'}
              </p>
            </article>
          );
        })
      )}
    </div>
  );
}

function MatchCard({ match, yarn }: { match: Match; yarn: Yarn }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`card ${match.verdict}`}>
      <div className="card-head">
        <h4 className="card-title">{yarn.brand ? `${yarn.brand} ${yarn.name}` : yarn.name}</h4>
        <div className="card-actions">
          <VerdictPill verdict={match.verdict} />
        </div>
      </div>
      <YarnSpec yarn={yarn} />
      <p className="reason">{match.reason}</p>
      {match.skeinsShort ? (
        <p className="spec" style={{ marginTop: 6 }}>
          Buy {match.skeinsShort} more skein{match.skeinsShort === 1 ? '' : 's'} of dye lot {yarn.dyeLot ?? '—'} to close the gap.
        </p>
      ) : null}
      <button type="button" className="btn btn-quiet" onClick={() => setOpen(!open)} aria-expanded={open} style={{ marginTop: 10 }}>
        {open ? 'Hide the four checks' : 'Show the four checks'}
      </button>
      {open ? <CheckList checks={match.checks} /> : null}
    </article>
  );
}

const GROUPS: { verdict: Verdict; heading: string }[] = [
  { verdict: 'works', heading: 'Works' },
  { verdict: 'close', heading: 'Close — worth a swatch' },
  { verdict: 'no', heading: 'No' },
];

export function MatchesView({ projects, yarns }: { projects: Project[]; yarns: Yarn[] }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const project = projects.find((p) => p.id === selectedId) ?? projects[0];

  if (!project) {
    return (
      <div>
        <p className="eyebrow">Matches</p>
        <p className="empty">Add a project first — matching needs something to match against.</p>
      </div>
    );
  }

  const matches = matchStashToProject(yarns, project);

  return (
    <div>
      <p className="eyebrow">Matches</p>
      <Field label="Project">
        <select id="m-project" value={project.id} onChange={(e) => setSelectedId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <div className="spec" style={{ marginBottom: 16 }}>
        Needs {weightSpec(project.weightClass).name} · {project.yardsNeeded.toLocaleString()} yd
        {project.gaugeStsPer4in ? ` · ${project.gaugeStsPer4in} sts/4"` : ''}
      </div>

      {yarns.length === 0 ? <p className="empty">Your stash is empty, so there is nothing to match.</p> : null}

      {GROUPS.map(({ verdict, heading }) => {
        const group = matches.filter((m) => m.verdict === verdict);
        if (group.length === 0) return null;
        return (
          <section key={verdict} style={{ marginBottom: 20 }}>
            <p className="eyebrow" style={{ color: 'var(--ink-faint)' }}>{heading} · {group.length}</p>
            <div className="stack">
              {group.map((match) => {
                const yarn = yarns.find((y) => y.id === match.yarnId);
                return yarn ? <MatchCard key={match.yarnId} match={match} yarn={yarn} /> : null;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
