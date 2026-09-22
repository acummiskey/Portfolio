import { useEffect, useMemo, useState } from 'react';
import type { Project, Yarn } from './core/types';
import { matchStashToProject } from './core/match';
import { load, save, type StashState } from './lib/storage';
import { SEED } from './lib/seed';
import { MatchesView, ProjectsView, StashView } from './ui/views';
import { Scan } from './ui/Scan';

type Tab = 'stash' | 'projects' | 'matches';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stash', label: 'Stash' },
  { id: 'projects', label: 'Projects' },
  { id: 'matches', label: 'Matches' },
];

export default function App() {
  const [state, setState] = useState<StashState>(() => load(SEED));
  const [tab, setTab] = useState<Tab>('matches');
  const [scanning, setScanning] = useState(false);

  useEffect(() => { save(state); }, [state]);

  /** The headline number: projects the current stash can actually finish. */
  const ready = useMemo(
    () => state.projects.filter((p) => matchStashToProject(state.yarns, p).some((m) => m.verdict === 'works')).length,
    [state],
  );

  const addYarn = (yarn: Yarn) => {
    setState((prev) => ({ ...prev, yarns: [yarn, ...prev.yarns] }));
    setScanning(false);
    setTab('stash');
  };
  const removeYarn = (id: string) =>
    setState((prev) => ({ ...prev, yarns: prev.yarns.filter((y) => y.id !== id) }));
  const addProject = (project: Project) =>
    setState((prev) => ({ ...prev, projects: [project, ...prev.projects] }));
  const removeProject = (id: string) =>
    setState((prev) => ({ ...prev, projects: prev.projects.filter((p) => p.id !== id) }));

  return (
    <div className="app">
      <header className="app-bar">
        <h1>Stash Match</h1>
        <span className="tally">
          {ready} of {state.projects.length} ready to cast on
        </span>
      </header>

      <main className="screen">
        {scanning ? (
          <Scan onAdd={addYarn} onCancel={() => setScanning(false)} />
        ) : tab === 'stash' ? (
          <StashView yarns={state.yarns} projects={state.projects} onScan={() => setScanning(true)} onRemove={removeYarn} />
        ) : tab === 'projects' ? (
          <ProjectsView projects={state.projects} yarns={state.yarns} onAdd={addProject} onRemove={removeProject} />
        ) : (
          <MatchesView projects={state.projects} yarns={state.yarns} />
        )}
      </main>

      <nav className="tabs" aria-label="Sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={!scanning && tab === id ? 'page' : undefined}
            onClick={() => { setScanning(false); setTab(id); }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
