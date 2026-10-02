import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from 'fflate';
import {
  FolderMeta,
  ProjectMeta,
  WorkspaceProject,
  WorkspaceSnapshot,
  isValidProject,
  readWorkspace,
} from './projectStorage';
import { t } from '../i18n';

// A backup is a .zip with a manifest (folders and the metadata of every project, trash
// included) and one Nori JSON per project, so each project can also be opened on its own.
const MANIFEST_NAME = 'nori-respaldo.json';
const BACKUP_FORMAT = 'nori-workspace-backup';
const BACKUP_VERSION = 1;

interface ManifestProject extends ProjectMeta {
  /** Path of the project's JSON inside the zip */
  file: string;
}

interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  createdAt: number;
  folders: FolderMeta[];
  projects: ManifestProject[];
}

export interface BackupSummary {
  projects: number;
  folders: number;
}

function slug(text: string) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'proyecto'
  );
}

function backupFileName(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `nori-respaldo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

/** Packs every project and folder of this browser into a zip and downloads it */
export function downloadWorkspaceBackup(): BackupSummary & { fileName: string } {
  const { folders, projects } = readWorkspace();
  const files: Zippable = {};
  const manifestProjects: ManifestProject[] = projects.map(({ meta, project }) => {
    const file = `proyectos/${slug(project.title)}_${meta.id}.nori.json`;
    files[file] = strToU8(JSON.stringify(project, null, 2));
    return { ...meta, file };
  });
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: __APP_VERSION__ || '',
    createdAt: Date.now(),
    folders,
    projects: manifestProjects,
  };
  files[MANIFEST_NAME] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName: a.download, projects: projects.length, folders: folders.length };
}

/** Reads a backup zip; throws with a readable message when it isn't a valid backup */
export async function readWorkspaceBackup(file: File): Promise<WorkspaceSnapshot> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error(t('El archivo no es un .zip válido o está dañado'));
  }

  const manifestEntry = entries[MANIFEST_NAME];
  if (!manifestEntry) throw new Error(t('El archivo no es un respaldo de Nori (falta nori-respaldo.json)'));
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestEntry));
  } catch {
    throw new Error(t('El índice del respaldo está dañado'));
  }
  if (manifest?.format !== BACKUP_FORMAT || !Array.isArray(manifest.projects)) {
    throw new Error(t('El archivo no es un respaldo de Nori'));
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new Error(t('El respaldo se creó con una versión más reciente de Nori; actualiza la aplicación'));
  }

  const folders: FolderMeta[] = (Array.isArray(manifest.folders) ? manifest.folders : [])
    .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
    .map((f) => ({ id: f.id, name: f.name, createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now() }));

  const projects: WorkspaceProject[] = [];
  for (const entry of manifest.projects) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.file !== 'string') continue;
    const data = entries[entry.file];
    if (!data) continue;
    let project: any;
    try {
      project = JSON.parse(strFromU8(data));
    } catch {
      continue;
    }
    if (!isValidProject(project)) continue;
    const { file: _file, ...meta } = entry;
    const now = Date.now();
    projects.push({
      meta: {
        ...meta,
        title: typeof project.title === 'string' ? project.title : meta.title,
        createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : now,
        updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : now,
      },
      project: { ...project, id: meta.id },
    });
  }

  if (projects.length === 0 && folders.length === 0) {
    throw new Error(t('El respaldo no contiene proyectos ni carpetas'));
  }
  return { folders, projects };
}
