import { Project } from '../types/animation';
import { getLanguage, t } from '../i18n';

// The workspace is an index with the metadata of every project, the list of folders and one
// entry per project with its data. It lives in this browser's localStorage, or, when a local
// folder is linked (see folderSync.ts), in memory while folderSync writes it to the folder.
// The id of the last opened project and the last view are always kept in localStorage.
const INDEX_KEY = 'nori-projects';
const PROJECT_KEY_PREFIX = 'nori-project:';
const LAST_PROJECT_KEY = 'nori-last-project-id';
const FOLDERS_KEY = 'nori-folders';
const LAST_VIEW_KEY = 'nori-last-view';
// Single project stored by versions before 1.2.0; moved into the index on the first load
const LEGACY_PROJECT_KEY = 'nori-last-project';

export interface ProjectMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Set while the project is in the trash */
  deletedAt?: number;
  /** Folder that holds the project; without it the project is at the root of Inicio */
  folderId?: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  createdAt: number;
}

const projectKey = (id: string) => `${PROJECT_KEY_PREFIX}${id}`;

/** Key-value store that holds the workspace; setItem throws when the value can't be stored */
export interface WorkspaceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export const browserStore: WorkspaceStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
  keys: () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  },
};

let store: WorkspaceStore = browserStore;

/** Where the workspace is read and written from now on (null: back to localStorage) */
export function setWorkspaceStore(next: WorkspaceStore | null) {
  store = next ?? browserStore;
}

/** Keys that belong to the workspace (the rest are preferences of this browser) */
export const isWorkspaceKey = (key: string) =>
  key === INDEX_KEY || key === FOLDERS_KEY || key.startsWith(PROJECT_KEY_PREFIX);

export const newProjectId = () => `project_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function isValidProject(parsed: any): parsed is Project {
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
    const raw = store.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.id === 'string') : [];
  } catch {
    // Unavailable storage (private mode, blocked site data) or corrupted data
    return [];
  }
}

function writeIndex(index: ProjectMeta[]): boolean {
  try {
    store.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/** True once the browser has stored projects at least once (false on the very first visit) */
export function hasProjectIndex(): boolean {
  try {
    return store.getItem(INDEX_KEY) !== null;
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
    const raw = store.getItem(projectKey(id));
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
    if (meta && store.getItem(key) === data) return true;
    store.setItem(key, data);
    const now = Date.now();
    const nextMeta: ProjectMeta = meta
      ? { ...meta, title: project.title, updatedAt: now }
      : { id: project.id, title: project.title, createdAt: now, updatedAt: now };
    return writeIndex(meta ? index.map((m) => (m.id === project.id ? nextMeta : m)) : [...index, nextMeta]);
  } catch {
    return false;
  }
}

/**
 * Stores a project as a new entry (with a new id), optionally inside a folder.
 * Returns null when it could not be stored.
 */
export function createProject(project: Project, folderId?: string | null): Project | null {
  const stored: Project = { ...project, id: newProjectId() };
  if (saveProject(stored)) {
    if (folderId && getFolder(folderId)) moveProjectToFolder(stored.id, folderId);
    return stored;
  }
  try {
    store.removeItem(projectKey(stored.id));
  } catch {}
  return null;
}

export function duplicateProject(id: string): Project | null {
  const source = loadProject(id);
  if (!source) return null;
  return createProject({ ...source, title: t('{title} (copia)', { title: source.title }) }, getProjectMeta(id)?.folderId);
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
    store.removeItem(projectKey(id));
  } catch {}
  return writeIndex(readIndex().filter((m) => m.id !== id));
}

export function emptyTrash(): number {
  const trashed = listTrashedProjects();
  trashed.forEach((m) => {
    try {
      store.removeItem(projectKey(m.id));
    } catch {}
  });
  writeIndex(readIndex().filter((m) => !m.deletedAt));
  return trashed.length;
}

// ── Folders ──────────────────────────────────────────────────────────────────

export const newFolderId = () => `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function readFolders(): FolderMeta[] {
  try {
    const raw = store.getItem(FOLDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeFolders(folders: FolderMeta[]): boolean {
  try {
    store.setItem(FOLDERS_KEY, JSON.stringify(folders));
    return true;
  } catch {
    return false;
  }
}

/** Folders in alphabetical order */
export function listFolders(): FolderMeta[] {
  return readFolders().sort((a, b) => a.name.localeCompare(b.name, getLanguage(), { sensitivity: 'base', numeric: true }));
}

export function getFolder(id: string): FolderMeta | null {
  return readFolders().find((f) => f.id === id) ?? null;
}

export function createFolder(name: string): FolderMeta | null {
  const folder: FolderMeta = { id: newFolderId(), name, createdAt: Date.now() };
  return writeFolders([...readFolders(), folder]) ? folder : null;
}

export function renameFolder(id: string, name: string): boolean {
  const folders = readFolders();
  if (!folders.some((f) => f.id === id)) return false;
  return writeFolders(folders.map((f) => (f.id === id ? { ...f, name } : f)));
}

/** Removes a folder; its projects (also those in the trash) go back to the root */
export function deleteFolder(id: string): boolean {
  const index = readIndex();
  const moved = index.map((m) => {
    if (m.folderId !== id) return m;
    const { folderId, ...rest } = m;
    return rest;
  });
  if (!writeIndex(moved)) return false;
  return writeFolders(readFolders().filter((f) => f.id !== id));
}

/** Moves a project into a folder, or to the root with null */
export function moveProjectToFolder(id: string, folderId: string | null): boolean {
  return updateMeta(id, ({ folderId: _old, ...m }) => (folderId ? { ...m, folderId } : m));
}

// ── Whole workspace (backups) ────────────────────────────────────────────────

export interface WorkspaceProject {
  meta: ProjectMeta;
  project: Project;
}

export interface WorkspaceSnapshot {
  folders: FolderMeta[];
  /** Every project, including the ones in the trash */
  projects: WorkspaceProject[];
}

export function readWorkspace(): WorkspaceSnapshot {
  const projects: WorkspaceProject[] = [];
  readIndex().forEach((meta) => {
    const project = loadProject(meta.id);
    if (project) projects.push({ meta, project });
  });
  return { folders: readFolders(), projects };
}

function nextFreeId(make: () => string, taken: Set<string>) {
  let id = make();
  while (taken.has(id)) id = make();
  return id;
}

/** True when the workspace has no projects (trash included) and no folders */
export const isWorkspaceEmpty = (workspace: WorkspaceSnapshot) =>
  workspace.projects.length === 0 && workspace.folders.length === 0;

/** Keys and values that hold a workspace in a store */
export function workspaceEntries(workspace: WorkspaceSnapshot): [string, string][] {
  return [
    [INDEX_KEY, JSON.stringify(workspace.projects.map((p) => p.meta))],
    [FOLDERS_KEY, JSON.stringify(workspace.folders)],
    ...workspace.projects.map(
      ({ meta, project }) => [projectKey(meta.id), JSON.stringify({ ...project, id: meta.id })] as [string, string]
    ),
  ];
}

/**
 * Same folders and same projects (data, folder, trash and edit date). Used to know whether a
 * linked folder already holds the workspace of this browser.
 */
export function sameWorkspace(a: WorkspaceSnapshot, b: WorkspaceSnapshot): boolean {
  const signature = (w: WorkspaceSnapshot) =>
    JSON.stringify([
      [...w.folders].map((f) => [f.id, f.name]).sort(),
      [...w.projects]
        .map(({ meta, project }) => [
          meta.id,
          meta.folderId ?? '',
          meta.deletedAt ?? 0,
          meta.updatedAt,
          JSON.stringify({ ...project, id: meta.id }),
        ])
        .sort(),
    ]);
  return signature(a) === signature(b);
}

/** Removes the workspace from localStorage (preferences, the last view and the last project stay) */
export function clearBrowserWorkspace() {
  try {
    browserStore.keys().filter(isWorkspaceKey).forEach((key) => localStorage.removeItem(key));
  } catch {}
}

/**
 * Writes a workspace from a backup. 'replace' removes every current project and folder
 * first; 'merge' keeps them and adds the backup next to them (an identical project that is
 * already stored is skipped, one that clashes with an existing id gets a new one).
 * If anything can't be stored, the store goes back to how it was and false is returned.
 */
export function writeWorkspace(
  workspace: WorkspaceSnapshot,
  mode: 'merge' | 'replace'
): { ok: boolean; projects: number; folders: number } {
  // Copy of the whole workspace, to roll back on failure
  const snapshot = new Map<string, string>();
  try {
    store.keys().filter(isWorkspaceKey).forEach((key) => snapshot.set(key, store.getItem(key) ?? ''));
  } catch {
    return { ok: false, projects: 0, folders: 0 };
  }

  const rollback = () => {
    try {
      store.keys().filter(isWorkspaceKey).forEach((key) => store.removeItem(key));
      snapshot.forEach((value, key) => store.setItem(key, value));
    } catch {}
  };

  try {
    let index: ProjectMeta[] = [];
    let folders: FolderMeta[] = [];
    if (mode === 'replace') {
      readIndex().forEach((m) => store.removeItem(projectKey(m.id)));
      try {
        localStorage.removeItem(LAST_PROJECT_KEY);
      } catch {}
    } else {
      index = readIndex();
      folders = readFolders();
    }

    // Folders: reuse the ones already present with the same id
    const folderIds = new Set(folders.map((f) => f.id));
    let addedFolders = 0;
    workspace.folders.forEach((f) => {
      if (folderIds.has(f.id)) return;
      folders.push(f);
      folderIds.add(f.id);
      addedFolders++;
    });

    const projectIds = new Set(index.map((m) => m.id));
    let addedProjects = 0;
    for (const { meta, project } of workspace.projects) {
      const data = JSON.stringify({ ...project, id: meta.id });
      if (projectIds.has(meta.id) && store.getItem(projectKey(meta.id)) === data) continue;
      const id = projectIds.has(meta.id) ? nextFreeId(newProjectId, projectIds) : meta.id;
      const { folderId, ...rest } = meta;
      const nextMeta: ProjectMeta = { ...rest, id, title: project.title };
      if (folderId && folderIds.has(folderId)) nextMeta.folderId = folderId;
      store.setItem(projectKey(id), JSON.stringify({ ...project, id }));
      index.push(nextMeta);
      projectIds.add(id);
      addedProjects++;
    }

    store.setItem(FOLDERS_KEY, JSON.stringify(folders));
    store.setItem(INDEX_KEY, JSON.stringify(index));
    return { ok: true, projects: addedProjects, folders: addedFolders };
  } catch {
    rollback();
    return { ok: false, projects: 0, folders: 0 };
  }
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

/** Screen shown when the page was left: the editor (with the last project) or a view of Inicio */
export type LastView =
  | { screen: 'editor' }
  | { screen: 'home'; section?: 'projects' | 'trash' | 'storage' | 'about'; folderId?: string | null };

export function getLastView(): LastView | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_VIEW_KEY) ?? 'null');
    return parsed && (parsed.screen === 'editor' || parsed.screen === 'home') ? parsed : null;
  } catch {
    return null;
  }
}

export function setLastView(view: LastView) {
  try {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(view));
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
