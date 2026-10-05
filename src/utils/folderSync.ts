import { useSyncExternalStore } from 'react';
import {
  FolderMeta,
  ProjectMeta,
  WorkspaceSnapshot,
  WorkspaceStore,
  clearBrowserWorkspace,
  getLastProjectId,
  isValidProject,
  isWorkspaceEmpty,
  readWorkspace,
  sameWorkspace,
  setLastProjectId,
  setWorkspaceStore,
  workspaceEntries,
  writeWorkspace,
} from './projectStorage';
import { backupFileName, buildWorkspaceBackup } from './workspaceBackup';
import { setLanguage, t } from '../i18n';

/**
 * Workspace linked to a local folder (File System Access API, Chromium browsers only).
 *
 * While a folder is linked, the workspace lives in memory (projectStorage reads and writes a
 * MemoryStore) and every change is written to the folder shortly after. The folder holds:
 *
 *   nori-espacio.json        folders, the metadata of every project (edit dates included)
 *                            and the preferences of Nori
 *   <Proyecto>.nori.json     projects at the root of Inicio
 *   <Carpeta>/…nori.json     one directory per folder of Inicio
 *   _papelera/…nori.json     projects in the trash
 *   _respaldos/*.zip         backups Nori leaves when linking discards a workspace
 *   _archivos-ajenos/        files that weren't part of Nori, when the user chose to move them
 *
 * Every project file is a regular Nori JSON, so it can also be opened on its own. The folder
 * handle is kept in IndexedDB; browsers usually ask again for permission on each visit, and
 * until it is granted the workspace can't be read (the interface shows it as pending).
 */

export const MANIFEST_FILE = 'nori-espacio.json';
const MANIFEST_FORMAT = 'nori-workspace-folder';
const MANIFEST_VERSION = 1;
export const TRASH_DIR = '_papelera';
export const BACKUPS_DIR = '_respaldos';
export const FOREIGN_DIR = '_archivos-ajenos';
const PROJECT_EXT = '.nori.json';
// Names at the root that a folder or project of Inicio can't take
const RESERVED_NAMES = [MANIFEST_FILE, TRASH_DIR, BACKUPS_DIR, FOREIGN_DIR];
// Files the operating system adds by itself; they don't count as content of the folder
const SYSTEM_FILES = /^(\.ds_store|thumbs\.db|desktop\.ini|\.localized|\._.*)$/i;
// Preferences of this browser saved in the manifest
const SETTINGS_KEYS: Record<string, string> = { language: 'nori-language', theme: 'nori-theme', projectSort: 'nori-project-sort' };
// Time between the last change and its write to the folder
const WRITE_DELAY = 300;

// The File System Access API is only partly in TypeScript's DOM types
type DirHandle = FileSystemDirectoryHandle;
type AnyHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
type PermissionState = 'granted' | 'denied' | 'prompt';

export const isFolderSupported = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof indexedDB !== 'undefined';

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Where the workspace is. In a folder: 'ready' while it can be written, 'permission' when
 * the browser needs the user to allow access again, 'unavailable' when the folder can't be
 * read (moved, deleted or with a damaged index). `loaded` tells whether the workspace is in
 * memory (it can still be edited; the changes wait until the folder is available again).
 * `revision` changes every time the workspace is read again from the folder.
 */
export type StorageStatus =
  | { mode: 'browser'; revision: number }
  | {
      mode: 'folder';
      state: 'loading' | 'ready' | 'permission' | 'unavailable';
      name: string;
      loaded: boolean;
      revision: number;
    };

let status: StorageStatus = { mode: 'browser', revision: 0 };
const listeners = new Set<() => void>();

function setStatus(next: StorageStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

function setFolderState(state: 'loading' | 'ready' | 'permission' | 'unavailable', bumpRevision = false) {
  setStatus({
    mode: 'folder',
    state,
    name: handle?.name ?? '',
    loaded: !!memory,
    revision: status.revision + (bumpRevision ? 1 : 0),
  });
}

export const getStorageStatus = () => status;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Current storage status; the component renders again when it changes */
export const useStorageStatus = () => useSyncExternalStore(subscribe, getStorageStatus, getStorageStatus);

/** The folder needs the user's attention (permission or a folder that can't be read) */
export const needsFolderAttention = (s: StorageStatus = status) =>
  s.mode === 'folder' && (s.state === 'permission' || s.state === 'unavailable');

/** Projects can be listed, opened and created (false while a linked folder can't be read yet) */
export const isWorkspaceAvailable = (s: StorageStatus = status) => s.mode === 'browser' || s.loaded;

// ── Folder handle in IndexedDB ────────────────────────────────────────────────

const DB_NAME = 'nori-carpeta';
const DB_STORE = 'handles';
const HANDLE_KEY = 'workspace';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const loadSavedHandle = () => idbRequest<DirHandle | undefined>('readonly', (s) => s.get(HANDLE_KEY));
const saveHandle = (dir: DirHandle) => idbRequest('readwrite', (s) => s.put(dir, HANDLE_KEY));
const forgetHandle = () => idbRequest('readwrite', (s) => s.delete(HANDLE_KEY));

function deleteHandleDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ── File helpers ──────────────────────────────────────────────────────────────

const splitPath = (path: string) => path.split('/').filter(Boolean);
const dirOf = (path: string) => splitPath(path).slice(0, -1).join('/');
const baseOf = (path: string) => splitPath(path).pop() ?? '';
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

async function getDir(root: DirHandle, path: string, create: boolean): Promise<DirHandle> {
  let dir = root;
  for (const part of splitPath(path)) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function writeFile(root: DirHandle, path: string, content: string | Uint8Array) {
  const dir = await getDir(root, dirOf(path), true);
  const file = await dir.getFileHandle(baseOf(path), { create: true });
  const writable = await (file as any).createWritable();
  await writable.write(content);
  await writable.close();
}

async function readText(root: DirHandle, path: string): Promise<string | null> {
  try {
    const dir = await getDir(root, dirOf(path), false);
    const file = await dir.getFileHandle(baseOf(path));
    return await (await file.getFile()).text();
  } catch (err: any) {
    if (err?.name === 'NotFoundError' || err?.name === 'TypeMismatchError') return null;
    throw err;
  }
}

/** Removes a file or directory; one that is already gone is not an error */
async function removePath(root: DirHandle, path: string, recursive = false) {
  try {
    const dir = await getDir(root, dirOf(path), false);
    await dir.removeEntry(baseOf(path), { recursive });
  } catch (err: any) {
    if (err?.name !== 'NotFoundError') throw err;
  }
}

interface Entry {
  name: string;
  kind: 'file' | 'directory';
  handle: AnyHandle;
}

async function listEntries(dir: DirHandle): Promise<Entry[]> {
  const entries: Entry[] = [];
  for await (const [name, entry] of (dir as any).entries() as AsyncIterable<[string, AnyHandle]>) {
    entries.push({ name, kind: entry.kind, handle: entry });
  }
  return entries;
}

async function copyEntry(entry: Entry, target: DirHandle, name: string) {
  if (entry.kind === 'file') {
    const data = new Uint8Array(await (await (entry.handle as FileSystemFileHandle).getFile()).arrayBuffer());
    const file = await target.getFileHandle(name, { create: true });
    const writable = await (file as any).createWritable();
    await writable.write(data);
    await writable.close();
    return;
  }
  const dir = await target.getDirectoryHandle(name, { create: true });
  for (const child of await listEntries(entry.handle as DirHandle)) await copyEntry(child, dir, child.name);
}

// ── Names on disk ─────────────────────────────────────────────────────────────

/** A title as a file or directory name that works on Windows, macOS and Linux */
function safeName(text: string, fallback: string) {
  const name = text
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
    .trim();
  if (!name || /^\.+$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) return fallback;
  return name;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The name already follows the title: "Title.ext" or "Title (2).ext" */
const followsBase = (name: string, base: string, ext: string) =>
  new RegExp(`^${escapeRegExp(base)}( \\(\\d+\\))?${escapeRegExp(ext)}$`).test(name);

function uniqueName(base: string, ext: string, taken: Set<string>) {
  let name = `${base}${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
  return name;
}

// ── What is on disk ───────────────────────────────────────────────────────────

/** What Nori last wrote to (or read from) the folder */
interface DiskState {
  /** Folder id → directory name */
  folderDirs: Map<string, string>;
  /** Project id → path of its file */
  projectFiles: Map<string, string>;
  /** Path → project data (compact JSON) as it is in the file */
  contents: Map<string, string>;
  /** Text of nori-espacio.json */
  manifest: string | null;
}

const emptyDisk = (): DiskState => ({
  folderDirs: new Map(),
  projectFiles: new Map(),
  contents: new Map(),
  manifest: null,
});

interface ManifestFolder extends FolderMeta {
  path: string;
}

interface ManifestProject extends ProjectMeta {
  file: string;
}

interface FolderManifest {
  format: typeof MANIFEST_FORMAT;
  version: number;
  appVersion: string;
  folders: ManifestFolder[];
  projects: ManifestProject[];
  settings: Record<string, string>;
}

/**
 * Where each folder and project goes. A folder or project keeps its current name while it
 * still follows its title, so renaming or moving one doesn't rename the others.
 */
function planLayout(workspace: WorkspaceSnapshot, previous: DiskState) {
  const taken = new Map<string, Set<string>>();
  const takenIn = (dir: string) => {
    if (!taken.has(dir)) taken.set(dir, new Set(dir ? [] : RESERVED_NAMES.map((n) => n.toLowerCase())));
    return taken.get(dir)!;
  };
  const byAge = <T extends { id: string; createdAt: number }>(a: T, b: T) =>
    a.createdAt - b.createdAt || a.id.localeCompare(b.id);

  const folderDirs = new Map<string, string>();
  const root = takenIn('');
  [...workspace.folders].sort(byAge).forEach((folder) => {
    const base = safeName(folder.name, 'Carpeta');
    const kept = previous.folderDirs.get(folder.id);
    const dir = kept && followsBase(kept, base, '') && !root.has(kept.toLowerCase()) ? kept : uniqueName(base, '', root);
    root.add(dir.toLowerCase());
    folderDirs.set(folder.id, dir);
  });

  const projectFiles = new Map<string, string>();
  [...workspace.projects]
    .sort((a, b) => byAge(a.meta, b.meta))
    .forEach(({ meta, project }) => {
      const dir = meta.deletedAt ? TRASH_DIR : (meta.folderId && folderDirs.get(meta.folderId)) || '';
      const names = takenIn(dir);
      const base = safeName(project.title, 'Proyecto');
      const kept = previous.projectFiles.get(meta.id);
      const name =
        kept && dirOf(kept) === dir && followsBase(baseOf(kept), base, PROJECT_EXT) && !names.has(baseOf(kept).toLowerCase())
          ? baseOf(kept)
          : uniqueName(base, PROJECT_EXT, names);
      names.add(name.toLowerCase());
      projectFiles.set(meta.id, joinPath(dir, name));
    });

  return { folderDirs, projectFiles };
}

function readSettings(): Record<string, string> {
  const settings: Record<string, string> = {};
  Object.entries(SETTINGS_KEYS).forEach(([name, key]) => {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) settings[name] = value;
    } catch {}
  });
  return settings;
}

/** Applies the preferences saved in a folder (when its workspace replaces the browser's) */
function applySettings(settings: Record<string, string>) {
  if (settings.language === 'es' || settings.language === 'en') setLanguage(settings.language);
  if (settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system') {
    try {
      localStorage.setItem(SETTINGS_KEYS.theme, settings.theme);
    } catch {}
    window.dispatchEvent(new Event('nori-theme-change'));
  }
  if (settings.projectSort === 'recent' || settings.projectSort === 'manual') {
    try {
      localStorage.setItem(SETTINGS_KEYS.projectSort, settings.projectSort);
    } catch {}
  }
}

function buildManifest(workspace: WorkspaceSnapshot, layout: ReturnType<typeof planLayout>): string {
  const manifest: FolderManifest = {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    appVersion: __APP_VERSION__ || '',
    folders: workspace.folders.map((f) => ({ ...f, path: layout.folderDirs.get(f.id)! })),
    projects: workspace.projects.map(({ meta }) => ({ ...meta, file: layout.projectFiles.get(meta.id)! })),
    settings: readSettings(),
  };
  return JSON.stringify(manifest, null, 2);
}

const isSafePath = (path: unknown): path is string =>
  typeof path === 'string' && splitPath(path).length > 0 && splitPath(path).every((p) => p !== '..' && p !== '.');

interface FolderWorkspace {
  workspace: WorkspaceSnapshot;
  disk: DiskState;
  settings: Record<string, string>;
}

/** Reads the workspace of a folder; a folder without nori-espacio.json is an empty workspace */
async function readFolderWorkspace(dir: DirHandle): Promise<FolderWorkspace> {
  const text = await readText(dir, MANIFEST_FILE);
  if (text === null) return { workspace: { folders: [], projects: [] }, disk: emptyDisk(), settings: {} };

  let manifest: FolderManifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new FolderError(t('El índice de la carpeta ({file}) está dañado', { file: MANIFEST_FILE }));
  }
  if (manifest?.format !== MANIFEST_FORMAT || !Array.isArray(manifest.projects)) {
    throw new FolderError(t('{file} no es un índice de un espacio de trabajo de Nori', { file: MANIFEST_FILE }));
  }
  if (manifest.version > MANIFEST_VERSION) {
    throw new FolderError(t('La carpeta se guardó con una versión más reciente de Nori; actualiza la aplicación'));
  }

  const disk = emptyDisk();
  disk.manifest = text;
  const folders: FolderMeta[] = [];
  (Array.isArray(manifest.folders) ? manifest.folders : []).forEach((f) => {
    if (!f || typeof f.id !== 'string' || typeof f.name !== 'string') return;
    folders.push({ id: f.id, name: f.name, createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now() });
    if (isSafePath(f.path)) disk.folderDirs.set(f.id, f.path);
  });

  const projects: WorkspaceSnapshot['projects'] = [];
  for (const entry of manifest.projects) {
    if (!entry || typeof entry.id !== 'string' || !isSafePath(entry.file)) continue;
    const data = await readText(dir, entry.file);
    if (data === null) continue;
    let project: any;
    try {
      project = JSON.parse(data);
    } catch {
      continue;
    }
    if (!isValidProject(project)) continue;
    const { file, ...meta } = entry;
    const now = Date.now();
    const stored = { ...project, id: meta.id };
    projects.push({
      meta: {
        ...meta,
        title: typeof project.title === 'string' ? project.title : String(meta.title ?? ''),
        createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : now,
        updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : now,
      },
      project: stored,
    });
    disk.projectFiles.set(meta.id, file);
    disk.contents.set(file, JSON.stringify(stored));
  }

  const settings = manifest.settings && typeof manifest.settings === 'object' ? manifest.settings : {};
  return { workspace: { folders, projects }, disk, settings };
}

/** An error with a message meant for the user */
export class FolderError extends Error {}

// ── Linked folder in memory ───────────────────────────────────────────────────

class MemoryStore implements WorkspaceStore {
  private data: Map<string, string>;
  constructor(entries: [string, string][], private onChange: () => void) {
    this.data = new Map(entries);
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.data.get(key) === value) return;
    this.data.set(key, value);
    this.onChange();
  }
  removeItem(key: string) {
    if (this.data.delete(key)) this.onChange();
  }
  keys() {
    return [...this.data.keys()];
  }
}

// Store used while the folder can't be read: nothing can be saved, so nothing is lost
const lockedStore: WorkspaceStore = {
  getItem: () => null,
  setItem: () => {
    throw new Error('The linked folder is not available');
  },
  removeItem: () => {},
  keys: () => [],
};

let handle: DirHandle | null = null;
let memory: MemoryStore | null = null;
let disk: DiskState = emptyDisk();
let dirty = false;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<boolean> | null = null;

function markDirty() {
  dirty = true;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => void flushFolder(), WRITE_DELAY);
}

/** Changes made in memory that aren't in the folder yet */
export const hasPendingWrites = () => status.mode === 'folder' && (dirty || !!flushing);

function useWorkspace(next: FolderWorkspace) {
  memory = new MemoryStore(workspaceEntries(next.workspace), markDirty);
  disk = next.disk;
  dirty = false;
  setWorkspaceStore(memory);
}

function handleFolderError(err: any) {
  console.warn('Nori: linked folder', err);
  if (status.mode !== 'folder') return;
  setFolderState(err?.name === 'NotFoundError' || err instanceof FolderError ? 'unavailable' : 'permission');
}

/** Writes to the folder what changed since the last write */
async function writeChanges(dir: DirHandle) {
  const workspace = readWorkspace();
  const layout = planLayout(workspace, disk);

  for (const folderDir of layout.folderDirs.values()) await getDir(dir, folderDir, true);

  const contents = new Map<string, string>();
  for (const { meta, project } of workspace.projects) {
    const path = layout.projectFiles.get(meta.id)!;
    const data = JSON.stringify(project);
    if (disk.contents.get(path) !== data) await writeFile(dir, path, JSON.stringify(project, null, 2));
    contents.set(path, data);
  }

  // The index goes last among the writes: the files it points to already exist
  const manifest = buildManifest(workspace, layout);
  if (manifest !== disk.manifest) await writeFile(dir, MANIFEST_FILE, manifest);

  for (const path of disk.contents.keys()) if (!contents.has(path)) await removePath(dir, path);
  // Directories of folders that were renamed or deleted, only if they were left empty
  const dirs = new Set(layout.folderDirs.values());
  for (const old of disk.folderDirs.values()) {
    if (!dirs.has(old)) await removePath(dir, old).catch(() => {});
  }
  if (!workspace.projects.some((p) => p.meta.deletedAt)) await removePath(dir, TRASH_DIR).catch(() => {});

  disk = { ...layout, contents, manifest };
}

/** Writes the pending changes now; false when the folder couldn't be written */
export function flushFolder(): Promise<boolean> {
  clearTimeout(writeTimer);
  if (flushing) return flushing;
  if (!dirty) return Promise.resolve(true);
  if (status.mode !== 'folder' || status.state !== 'ready' || !handle || !memory) return Promise.resolve(false);
  const dir = handle;
  const run = async () => {
    while (dirty) {
      dirty = false;
      try {
        await writeChanges(dir);
      } catch (err) {
        dirty = true;
        handleFolderError(err);
        return false;
      }
    }
    channel?.postMessage({ type: 'changed' });
    return true;
  };
  // Cleared once settled (never before the assignment, even if nothing awaits)
  const current = run().finally(() => {
    if (flushing === current) flushing = null;
  });
  flushing = current;
  return current;
}

async function queryPermission(dir: DirHandle, request: boolean): Promise<PermissionState> {
  const options = { mode: 'readwrite' };
  try {
    return request ? await (dir as any).requestPermission(options) : await (dir as any).queryPermission(options);
  } catch {
    return 'denied';
  }
}

/**
 * Reads the workspace of the linked folder. Linking always writes nori-espacio.json, so
 * without it the folder was renamed, moved or deleted (the handle points to a path that no
 * longer exists, or to a different folder now): the connection is lost, it isn't empty.
 */
async function readLinkedWorkspace(dir: DirHandle): Promise<FolderWorkspace> {
  const read = await readFolderWorkspace(dir);
  if (read.disk.manifest === null) throw new FolderError(t('Se perdió la conexión con la carpeta'));
  return read;
}

/** Reads the linked folder into memory */
async function openFolder(dir: DirHandle) {
  try {
    useWorkspace(await readLinkedWorkspace(dir));
    setFolderState('ready', true);
  } catch (err) {
    handleFolderError(err);
  }
}

/**
 * Called once before the interface starts: with a linked folder, its workspace is read if
 * the browser still allows it; otherwise the workspace waits for the user to allow it.
 */
export async function initWorkspaceStorage() {
  if (!isFolderSupported()) return;
  let saved: DirHandle | undefined;
  try {
    saved = await loadSavedHandle();
  } catch {
    return;
  }
  if (!saved) return;
  handle = saved;
  memory = null;
  setWorkspaceStore(lockedStore);
  setFolderState('loading');
  if ((await queryPermission(saved, false)) === 'granted') await openFolder(saved);
  else setFolderState('permission');
}

/**
 * Asks the browser for access to the linked folder again (it must run from a click). With the
 * workspace already in memory, the pending changes are written; otherwise it is read.
 */
export async function requestFolderPermission(): Promise<boolean> {
  if (!handle) return false;
  const dir = handle;
  if ((await queryPermission(dir, true)) !== 'granted') {
    // A folder that no longer exists can't be granted: it stays as a lost connection
    if (!(status.mode === 'folder' && status.state === 'unavailable')) setFolderState('permission');
    return false;
  }
  if (memory) {
    setFolderState('ready');
    dirty = true;
    return flushFolder();
  }
  setFolderState('loading');
  await openFolder(dir);
  return status.mode === 'folder' && status.state === 'ready';
}

// ── Linking ───────────────────────────────────────────────────────────────────

/** Opens the system dialog to choose a folder; throws an AbortError when it is closed */
export function pickFolder(): Promise<DirHandle> {
  return (window as any).showDirectoryPicker({ id: 'nori-workspace', mode: 'readwrite', startIn: 'documents' });
}

/** A file or directory of a chosen folder that isn't part of the Nori workspace */
export interface ForeignEntry {
  path: string;
  kind: 'file' | 'directory';
  /** Internal: to move or delete it */
  entry: Entry;
}

export type FolderScan =
  | { kind: 'empty' }
  /** Files that have nothing to do with Nori (no workspace) */
  | { kind: 'foreign'; entries: string[]; reason?: string }
  | ({ kind: 'nori'; extras: ForeignEntry[] } & FolderWorkspace);

/** What a chosen folder holds: nothing, a Nori workspace (perhaps with other files) or other files */
export async function scanFolder(dir: DirHandle): Promise<FolderScan> {
  const entries = (await listEntries(dir)).filter((e) => !SYSTEM_FILES.test(e.name));
  const hasManifest = entries.some((e) => e.kind === 'file' && e.name === MANIFEST_FILE);
  if (!hasManifest) {
    // A folder with only the backups Nori left in it counts as empty
    const others = entries.filter((e) => !(e.kind === 'directory' && e.name === BACKUPS_DIR));
    return others.length === 0 ? { kind: 'empty' } : { kind: 'foreign', entries: others.map((e) => e.name) };
  }

  let read: FolderWorkspace;
  try {
    read = await readFolderWorkspace(dir);
  } catch (err: any) {
    if (!(err instanceof FolderError)) throw err;
    return { kind: 'foreign', entries: entries.map((e) => e.name), reason: err.message };
  }

  const knownDirs = new Set([...read.disk.folderDirs.values(), TRASH_DIR]);
  const extras: ForeignEntry[] = [];
  for (const entry of entries) {
    if (entry.name === MANIFEST_FILE || entry.name === BACKUPS_DIR || entry.name === FOREIGN_DIR) continue;
    if (entry.kind === 'file' && read.disk.contents.has(entry.name)) continue;
    if (entry.kind === 'directory' && knownDirs.has(entry.name)) {
      for (const child of await listEntries(entry.handle as DirHandle)) {
        if (SYSTEM_FILES.test(child.name)) continue;
        const path = joinPath(entry.name, child.name);
        if (child.kind === 'file' && read.disk.contents.has(path)) continue;
        extras.push({ path, kind: child.kind, entry: child });
      }
      continue;
    }
    extras.push({ path: entry.name, kind: entry.kind, entry });
  }
  return { kind: 'nori', extras, ...read };
}

export type ExtrasAction = 'ignore' | 'delete' | 'move';

/** Deletes the files that aren't part of Nori, or moves them to _archivos-ajenos */
async function resolveExtras(dir: DirHandle, extras: ForeignEntry[], action: ExtrasAction) {
  if (action === 'ignore') return;
  for (const extra of extras) {
    if (action === 'move') {
      const target = await getDir(dir, joinPath(FOREIGN_DIR, dirOf(extra.path)), true);
      const taken = new Set((await listEntries(target)).map((e) => e.name.toLowerCase()));
      const name = baseOf(extra.path);
      const dot = extra.kind === 'file' ? name.lastIndexOf('.') : -1;
      const free = dot > 0 ? uniqueName(name.slice(0, dot), name.slice(dot), taken) : uniqueName(name, '', taken);
      await copyEntry(extra.entry, target, free);
    }
    await removePath(dir, extra.path, true);
  }
}

/**
 * - 'merge': the projects and folders of the browser are added to the ones of the folder
 * - 'browser': the folder is left exactly like the workspace of the browser
 * - 'folder': the workspace of the folder is kept and the one of the browser is discarded
 */
export type LinkResolution = 'merge' | 'browser' | 'folder';

/**
 * Links the folder: the workspace chosen is written to it, a zip of the workspace that is
 * discarded is left in _respaldos, and the workspace leaves localStorage.
 * Returns the names of the backups left in the folder.
 */
export async function linkFolder(
  dir: DirHandle,
  scan: FolderScan,
  options: { resolution: LinkResolution; extras: ExtrasAction }
): Promise<string[]> {
  if (scan.kind === 'foreign') throw new FolderError(t('La carpeta tiene archivos que no son de Nori'));
  const browserWorkspace = readWorkspace();
  const folder: FolderWorkspace =
    scan.kind === 'nori' ? scan : { workspace: { folders: [], projects: [] }, disk: emptyDisk(), settings: {} };

  if (scan.kind === 'nori') await resolveExtras(dir, scan.extras, options.extras);

  // Zip of the workspace that won't be kept as it is
  const backups: string[] = [];
  const discarded = options.resolution === 'browser' ? folder.workspace : browserWorkspace;
  if (!isWorkspaceEmpty(discarded) && !sameWorkspace(browserWorkspace, folder.workspace)) {
    const name = backupFileName(options.resolution === 'browser' ? 'carpeta' : 'navegador');
    await writeFile(dir, joinPath(BACKUPS_DIR, name), buildWorkspaceBackup(discarded));
    backups.push(name);
  }

  handle = dir;
  memory = new MemoryStore(
    workspaceEntries(options.resolution === 'browser' ? browserWorkspace : folder.workspace),
    markDirty
  );
  // Starting from what is in the folder, the first write only changes what differs
  disk = folder.disk;
  setWorkspaceStore(memory);
  if (options.resolution === 'merge') writeWorkspace(browserWorkspace, 'merge');
  setFolderState('ready');
  dirty = true;

  if (!(await flushFolder())) {
    handle = null;
    memory = null;
    disk = emptyDisk();
    dirty = false;
    setWorkspaceStore(null);
    setStatus({ mode: 'browser', revision: status.revision + 1 });
    throw new FolderError(t('No se pudo escribir en la carpeta. No se cambió nada en el navegador.'));
  }

  await saveHandle(dir);
  if (options.resolution === 'folder') applySettings(folder.settings);
  clearBrowserWorkspace();
  setFolderState('ready', true);
  channel?.postMessage({ type: 'mode' });
  return backups;
}

/**
 * Unlinks the folder: the workspace goes back to localStorage and the files stay in the folder.
 * When the folder couldn't be read, the browser starts with an empty workspace.
 * Throws when the workspace doesn't fit in the browser (nothing changes then).
 */
export async function unlinkFolder(): Promise<{ copied: boolean }> {
  if (status.mode !== 'folder') return { copied: false };
  let workspace: WorkspaceSnapshot | null = null;
  if (memory) {
    if (status.state === 'ready') await flushFolder();
    workspace = readWorkspace();
  }

  setWorkspaceStore(null);
  if (workspace) {
    const lastId = getLastProjectId();
    if (!writeWorkspace(workspace, 'replace').ok) {
      setWorkspaceStore(memory);
      throw new FolderError(
        t('El espacio de trabajo no cabe en el almacenamiento del navegador (unos 5 MB). Descarga un respaldo o elimina proyectos antes de desvincular.')
      );
    }
    if (lastId) setLastProjectId(lastId);
  }

  try {
    await forgetHandle();
  } catch {}
  handle = null;
  memory = null;
  disk = emptyDisk();
  dirty = false;
  clearTimeout(writeTimer);
  setStatus({ mode: 'browser', revision: status.revision + 1 });
  channel?.postMessage({ type: 'mode' });
  return { copied: !!workspace };
}

// ── Clearing the browser ──────────────────────────────────────────────────────

/**
 * Left in sessionStorage after clearing the browser, so the reload doesn't store the example
 * project again; it disappears with the tab.
 */
export const BROWSER_CLEARED_KEY = 'nori-browser-cleared';

/**
 * Removes everything Nori keeps in this browser: the workspace, the preferences and the link
 * to the folder (whose files are not touched). The page should be reloaded afterwards.
 */
export async function wipeBrowserData() {
  if (status.mode === 'folder' && status.state === 'ready') await flushFolder();
  clearTimeout(writeTimer);
  handle = null;
  memory = null;
  disk = emptyDisk();
  dirty = false;
  setWorkspaceStore(null);
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith('nori-')) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {}
  }
  await deleteHandleDatabase();
  try {
    sessionStorage.setItem(BROWSER_CLEARED_KEY, '1');
  } catch {}
  setStatus({ mode: 'browser', revision: status.revision + 1 });
  channel?.postMessage({ type: 'mode' });
}

// ── Other tabs and closing the page ───────────────────────────────────────────

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nori-workspace') : null;

if (channel) {
  channel.onmessage = (e: MessageEvent) => {
    // The workspace was linked, unlinked or cleared in another tab
    if (e.data?.type === 'mode') {
      // An editor open here saves on unload: keep it from writing a workspace that moved
      setWorkspaceStore(lockedStore);
      window.location.reload();
      return;
    }
    // Another tab wrote to the folder: read it again, unless this tab has its own changes waiting
    if (e.data?.type === 'changed' && status.mode === 'folder' && status.state === 'ready' && handle && memory) {
      if (dirty || flushing) return;
      const dir = handle;
      readLinkedWorkspace(dir)
        .then((next) => {
          if (dirty || flushing || handle !== dir) return;
          useWorkspace(next);
          setFolderState('ready', true);
        })
        .catch(handleFolderError);
    }
  };
}

/** Asks for confirmation before closing the page while changes are still being written to the folder */
export function guardUnload(e: BeforeUnloadEvent) {
  if (!hasPendingWrites()) return;
  void flushFolder();
  e.preventDefault();
  e.returnValue = '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', guardUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPendingWrites()) void flushFolder();
  });
}
