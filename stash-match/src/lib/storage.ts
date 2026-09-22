import type { Project, Yarn } from '../core/types';

const KEY = 'stash-match/v1';

export interface StashState {
  yarns: Yarn[];
  projects: Project[];
}

/**
 * localStorage can throw or come back empty in a private window, so every read
 * falls back to the seed rather than rendering an empty shell.
 */
export function load(fallback: StashState): StashState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StashState>;
    if (!Array.isArray(parsed.yarns) || !Array.isArray(parsed.projects)) return fallback;
    return { yarns: parsed.yarns, projects: parsed.projects };
  } catch {
    return fallback;
  }
}

export function save(state: StashState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store is not worth interrupting the knitter over.
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
