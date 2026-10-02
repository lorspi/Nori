import { Project } from '../types/animation';

// Every project lives in this browser's localStorage: an index with the metadata of all
// of them and one entry per project with its data. The id of the last opened project is
// kept so it reopens on the next visit.
const INDEX_KEY = 'nori-projects';
const PROJECT_KEY_PREFIX = 'nori-project:';
const LAST_PROJECT_KEY = 'nori-last-project-id';
// Single project stored by versions before 1.2.0; moved into the index on the first load
const LEGACY_PROJECT_KEY = 'nori-last-project';

export interface ProjectMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Set while the project is in the trash */
  deletedAt?: number;
}

const projectKey = (id: string) => `${PROJECT_KEY_PREFIX}${id}`;

export const newProjectId = () => `project_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function isValidProject(parsed: any): parsed is Project {
  return (
    !!parsed &&
    Array.isArray(parsed.layers) &&
    typeof parsed.width === 'number' &&
    typeof parsed.height === 'number' &&
    typeof parsed.duration === 'number'
  );
}

function readIndex(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.id === 'string') : [];
  } catch {
    // Unavailable storage (private mode, blocked site data) or corrupted data
    return [];
  }
}

function writeIndex(index: ProjectMeta[]): boolean {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/** True once the browser has stored projects at least once (false on the very first visit) */
export function hasProjectIndex(): boolean {
  try {
    return localStorage.getItem(INDEX_KEY) !== null;
  } catch {
    return false;
  }
}

/** Moves the single project saved by older versions into the project list */
export function migrateLegacyProject() {
  try {
    const raw = localStorage.getItem(LEGACY_PROJECT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (isValidProject(parsed)) {
      const stored = createProject(parsed);
      if (!stored) return; // Keep the old copy if it could not be moved
      setLastProjectId(stored.id);
    }
    localStorage.removeItem(LEGACY_PROJECT_KEY);
  } catch {
    // Nothing to migrate
  }
}

/** Projects outside the trash, most recently edited first */
export function listProjects(): ProjectMeta[] {
  return readIndex()
    .filter((m) => !m.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Projects in the trash, most recently deleted first */
export function listTrashedProjects(): ProjectMeta[] {
  return readIndex()
    .filter((m) => !!m.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export function getProjectMeta(id: string): ProjectMeta | null {
  return readIndex().find((m) => m.id === id) ?? null;
}

export function loadProject(id: string): Project | null {
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidProject(parsed) ? { ...parsed, id } : null;
  } catch {
    return null;
  }
}

/**
 * Stores the project and updates its entry in the index. Nothing is written when the data
 * hasn't changed, so the edit date only moves with real edits.
 * Returns false when the project could not be stored (e.g. quota exceeded).
 */
export function saveProject(project: Project): boolean {
  try {
    const key = projectKey(project.id);
    const data = JSON.stringify(project);
    const index = readIndex();
    const meta = index.find((m) => m.id === project.id);
    if (meta && localStorage.getItem(key) === data) return true;
    localStorage.setItem(key, data);
    const now = Date.now();
    const nextMeta: ProjectMeta = meta
      ? { ...meta, title: project.title, updatedAt: now }
      : { id: project.id, title: project.title, createdAt: now, updatedAt: now };
    return writeIndex(meta ? index.map((m) => (m.id === project.id ? nextMeta : m)) : [...index, nextMeta]);
  } catch {
    return false;
  }
}

/** Stores a project as a new entry (with a new id). Returns null when it could not be stored. */
export function createProject(project: Project): Project | null {
  const stored: Project = { ...project, id: newProjectId() };
  if (saveProject(stored)) return stored;
  try {
    localStorage.removeItem(projectKey(stored.id));
  } catch {}
  return null;
}

export function duplicateProject(id: string): Project | null {
  const source = loadProject(id);
  if (!source) return null;
  return createProject({ ...source, title: `${source.title} (copia)` });
}

export function renameProject(id: string, title: string): boolean {
  const project = loadProject(id);
  return !!project && saveProject({ ...project, title });
}

function updateMeta(id: string, change: (meta: ProjectMeta) => ProjectMeta): boolean {
  const index = readIndex();
  if (!index.some((m) => m.id === id)) return false;
  return writeIndex(index.map((m) => (m.id === id ? change(m) : m)));
}

/** Moves a project to the trash (it can be restored) */
export function trashProject(id: string): boolean {
  return updateMeta(id, (m) => ({ ...m, deletedAt: Date.now() }));
}

export function restoreProject(id: string): boolean {
  return updateMeta(id, ({ deletedAt, ...m }) => m);
}

/** Removes a project and its data for good */
export function deleteProjectForever(id: string): boolean {
  try {
    localStorage.removeItem(projectKey(id));
  } catch {}
  return writeIndex(readIndex().filter((m) => m.id !== id));
}

export function emptyTrash(): number {
  const trashed = listTrashedProjects();
  trashed.forEach((m) => {
    try {
      localStorage.removeItem(projectKey(m.id));
    } catch {}
  });
  writeIndex(readIndex().filter((m) => !m.deletedAt));
  return trashed.length;
}

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {}
}

/** Characters Nori keeps in localStorage (browsers usually allow about 5 million per site) */
export function getStorageUsage(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('nori-')) total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {}
  return total;
}
