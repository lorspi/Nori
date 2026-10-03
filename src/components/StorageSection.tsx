/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  HardDrives,
  DownloadSimple,
  UploadSimple,
  Warning,
  FileArrowDown,
  Browsers,
  CheckCircle,
  Stack,
  ArrowsClockwise,
  FolderOpen,
  FolderSimplePlus,
  LinkBreak,
  LockKey,
  WarningCircle,
  CircleNotch,
  Broom,
  X,
  ArrowsMerge,
  FolderSimple,
  EyeSlash,
  TrashSimple,
  FolderDashed,
  Info,
} from '@phosphor-icons/react';
import { useUI } from '../lib/ui';
import { FolderMeta, ProjectMeta, isWorkspaceEmpty, readWorkspace, sameWorkspace, writeWorkspace } from '../utils/projectStorage';
import { downloadWorkspaceBackup, readWorkspaceBackup } from '../utils/workspaceBackup';
import {
  BACKUPS_DIR,
  ExtrasAction,
  FOREIGN_DIR,
  FolderError,
  ForeignEntry,
  LinkResolution,
  MANIFEST_FILE,
  TRASH_DIR,
  isFolderSupported,
  getStorageStatus,
  isWorkspaceAvailable,
  linkFolder,
  pickFolder,
  scanFolder,
  unlinkFolder,
  useStorageStatus,
  wipeBrowserData,
} from '../utils/folderSync';
import { useGrantFolderAccess } from './StorageBadge';
import { t } from '../i18n';

// Date of the last backup created in this browser, shown as a reminder
const LAST_BACKUP_KEY = 'nori-last-backup';

function readLastBackup(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

type ImportMode = 'merge' | 'replace';

const projectCount = (count: number) => (count === 1 ? t('1 proyecto') : t('{count} proyectos', { count }));
const folderCount = (count: number) => (count === 1 ? t('1 carpeta') : t('{count} carpetas', { count }));

const contentsOf = (workspace: { projects: unknown[]; folders: unknown[] }) =>
  t('{projects} y {folders}', {
    projects: projectCount(workspace.projects.length),
    folders: folderCount(workspace.folders.length),
  });

interface StorageSectionProps {
  projects: ProjectMeta[];
  trashed: ProjectMeta[];
  folders: FolderMeta[];
  formatRelative: (timestamp: number) => string;
  /** Lists changed after loading a backup, linking or unlinking a folder */
  onRestored: () => void;
}

export function StorageSection({ projects, trashed, folders, formatRelative, onRestored }: StorageSectionProps) {
  const { toast, confirm } = useUI();
  const storage = useStorageStatus();
  const grant = useGrantFolderAccess();
  const [lastBackup, setLastBackup] = useState<number | null>(readLastBackup);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState<'load' | 'unlink' | null>(null);
  const [dialog, setDialog] = useState<React.ReactNode>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const linked = storage.mode === 'folder';
  const folderName = storage.mode === 'folder' ? storage.name : '';
  const available = isWorkspaceAvailable(storage);
  const isEmpty = projects.length + trashed.length + folders.length === 0;

  /** Shows a dialog and waits for its answer (null when it is closed) */
  const ask = <T,>(render: (answer: (value: T | null) => void) => React.ReactNode) =>
    new Promise<T | null>((resolve) =>
      setDialog(
        render((value) => {
          setDialog(null);
          resolve(value);
        })
      )
    );

  // ── Backups ─────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    try {
      const { fileName } = downloadWorkspaceBackup();
      const now = Date.now();
      setLastBackup(now);
      try {
        localStorage.setItem(LAST_BACKUP_KEY, String(now));
      } catch {}
      toast(t('Respaldo descargado: {fileName}', { fileName }), 'success');
      return true;
    } catch {
      toast(t('No se pudo crear el respaldo'), 'error');
      return false;
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('load');
    try {
      const backup = await readWorkspaceBackup(file);
      const contents = contentsOf(backup);

      if (mode === 'replace') {
        const current = projects.length + trashed.length;
        const currentText = t('{projects} (papelera incluida) y {folders}', {
          projects: projectCount(current),
          folders: folderCount(folders.length),
        });
        const ok = await confirm({
          title: t('Reemplazar el espacio de trabajo'),
          message: linked
            ? t(
                'El respaldo contiene {contents}. Se eliminará todo lo que hay ahora en la carpeta "{name}" ({current}) y se reemplazará por el contenido del respaldo. Esta acción no se puede deshacer.',
                { contents, current: currentText, name: folderName }
              )
            : t(
                'El respaldo contiene {contents}. Se eliminará todo lo que hay ahora en este navegador ({current}) y se reemplazará por el contenido del respaldo. Esta acción no se puede deshacer.',
                { contents, current: currentText }
              ),
          confirmLabel: t('Reemplazar todo'),
          variant: 'danger',
        });
        if (ok !== true) return;
      }

      const result = writeWorkspace(backup, mode);
      if (!result.ok) {
        toast(t('No se pudo cargar el respaldo (espacio insuficiente en el navegador). No se cambió nada.'), 'error');
        return;
      }
      onRestored();
      if (mode === 'replace') {
        toast(t('Espacio de trabajo reemplazado: {contents}', { contents }), 'success');
      } else if (result.projects + result.folders === 0) {
        toast(t('Todo el contenido del respaldo ya estaba en tu espacio de trabajo'), 'info');
      } else {
        toast(
          t('Respaldo cargado: se añadieron {projects} y {folders}', {
            projects: projectCount(result.projects),
            folders: folderCount(result.folders),
          }),
          'success'
        );
      }
    } catch (err: any) {
      toast(err?.message || t('No se pudo leer el respaldo'), 'error');
    } finally {
      setBusy(null);
    }
  };

  // ── Local folder ────────────────────────────────────────────────────────────
  const { link: handleLink, linking, dialog: linkDialog } = useFolderLinking(onRestored);

  const handleUnlink = async () => {
    const loaded = storage.mode === 'folder' && storage.loaded;
    const ok = await confirm({
      title: t('Desvincular la carpeta'),
      message: loaded
        ? t('Tu espacio de trabajo volverá a guardarse en este navegador. Los archivos de la carpeta "{name}" no se borran: quedan como una copia que puedes volver a vincular más adelante.', {
            name: folderName,
          })
        : t('Nori no puede leer la carpeta "{name}" ahora mismo, así que el navegador empezará con un espacio de trabajo vacío. Los archivos de la carpeta no se borran; puedes volver a vincularla más adelante.', {
            name: folderName,
          }),
      confirmLabel: t('Desvincular'),
      variant: loaded ? 'default' : 'danger',
    });
    if (ok !== true) return;
    setBusy('unlink');
    try {
      const { copied } = await unlinkFolder();
      onRestored();
      toast(
        copied
          ? t('Carpeta desvinculada: tu espacio de trabajo vuelve a estar en este navegador')
          : t('Carpeta desvinculada'),
        'success'
      );
    } catch (err: any) {
      toast(err instanceof FolderError ? err.message : t('No se pudo desvincular la carpeta'), 'error');
    } finally {
      setBusy(null);
    }
  };

  // ── Clearing the browser ────────────────────────────────────────────────────
  const handleClear = async () => {
    const ok = await ask<true>((answer) => (
      <ClearBrowserDialog
        linkedFolder={linked ? folderName : null}
        canBackup={available && !isEmpty}
        onBackup={handleCreate}
        onAnswer={answer}
      />
    ));
    if (!ok) return;
    await wipeBrowserData();
    window.location.reload();
  };

  const modeOption = (value: ImportMode, title: string, desc: string, Icon: React.ElementType) => (
    <OptionCard
      key={value}
      name="backup-mode"
      active={mode === value}
      danger={value === 'replace'}
      onSelect={() => setMode(value)}
      title={title}
      desc={desc}
      Icon={Icon}
    />
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 select-text">
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <h1 className="text-2xl font-black text-foreground font-heading flex items-center gap-2">
            <HardDrives className="w-6 h-6 text-bento-blue shrink-0" />
            {t('Almacenamiento')}
          </h1>
          <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed max-w-2xl">
            {t('Decide dónde se guarda tu espacio de trabajo (en este navegador o en una carpeta de tu equipo), crea y carga respaldos, y borra lo que Nori guarda en el navegador cuando no quieras dejar rastro.')}
          </p>
        </div>

        {/* Where the workspace lives */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-bento-blue" />
                {t('Carpeta local')}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {linked
                  ? t('Tu espacio de trabajo está vinculado a una carpeta de tu equipo: cada cambio se guarda ahí al momento, y ya no ocupa espacio en el navegador. Puedes copiar la carpeta, incluirla en tus copias de seguridad o sincronizarla con Drive, Dropbox u OneDrive.')
                  : t('Vincula una carpeta de tu equipo y tu espacio de trabajo pasará a guardarse ahí, sin el límite de unos 5 MB del navegador. Cada carpeta de Inicio será una carpeta de archivos y cada proyecto un JSON de Nori, con un índice que guarda tus carpetas, las fechas de edición y tus preferencias.')}
              </p>
            </div>
            {!linked && (
              <button
                onClick={handleLink}
                disabled={!isFolderSupported() || busy !== null || linking}
                className="h-8 px-3 rounded-lg border bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {linking ? <CircleNotch className="w-4 h-4 animate-spin" /> : <FolderSimplePlus className="w-4 h-4" />}
                {linking ? t('Vinculando…') : t('Vincular carpeta…')}
              </button>
            )}
          </div>

          {storage.mode === 'folder' ? (
            <div className="rounded-xl border border-border bg-secondary p-3 flex items-center gap-3 flex-wrap">
              <FolderOpen className="w-8 h-8 text-bento-yellow shrink-0" weight="fill" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate font-heading">{storage.name}</p>
                <p
                  className={`text-[11px] flex items-center gap-1.5 mt-0.5 ${
                    storage.state === 'ready' ? 'text-muted-foreground' : storage.state === 'loading' ? 'text-muted-foreground' : 'text-destructive font-semibold'
                  }`}
                >
                  {storage.state === 'ready' ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-bento-green" />
                      {t('Vinculada · los cambios se guardan en la carpeta')}
                    </>
                  ) : storage.state === 'loading' ? (
                    <>
                      <CircleNotch className="w-3.5 h-3.5 animate-spin" />
                      {t('Abriendo la carpeta…')}
                    </>
                  ) : storage.state === 'permission' ? (
                    <>
                      <LockKey className="w-3.5 h-3.5" />
                      {storage.loaded
                        ? t('Nori perdió el permiso para escribir en la carpeta; tus cambios esperan a que lo concedas')
                        : t('El navegador necesita que vuelvas a dar permiso a Nori para abrir la carpeta')}
                    </>
                  ) : (
                    <>
                      <WarningCircle className="w-3.5 h-3.5" />
                      {t('Se perdió la conexión con la carpeta: puede que se haya renombrado, movido o borrado. Vuelve a vincularla; si la renombraste, elígela con su nuevo nombre.')}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {storage.state === 'unavailable' && (
                  <button
                    onClick={handleLink}
                    disabled={linking}
                    className="relative h-8 px-3 rounded-lg border bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {linking ? <CircleNotch className="w-4 h-4 animate-spin" /> : <FolderSimplePlus className="w-4 h-4" />}
                    {linking ? t('Vinculando…') : t('Volver a vincular…')}
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
                  </button>
                )}
                {storage.state === 'permission' && (
                  <button
                    onClick={grant}
                    className="relative h-8 px-3 rounded-lg border bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <LockKey className="w-4 h-4" />
                    {t('Dar permiso')}
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
                  </button>
                )}
                <button
                  onClick={handleUnlink}
                  disabled={busy !== null || storage.state === 'loading'}
                  className="h-8 px-3 rounded-lg border bg-card border-border text-foreground hover:bg-accent text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LinkBreak className="w-4 h-4 text-muted-foreground" />
                  {busy === 'unlink' ? t('Desvinculando…') : t('Desvincular')}
                </button>
              </div>
            </div>
          ) : !isFolderSupported() ? (
            <div className="rounded-xl border border-border bg-secondary p-3 text-[11px] text-muted-foreground flex items-start gap-2 leading-relaxed">
              <Info className="w-4 h-4 shrink-0 mt-px" />
              {t('Este navegador no permite que una página web guarde archivos en una carpeta de tu equipo. Para vincular una carpeta usa Chrome, Edge, Brave u Opera en un ordenador.')}
            </div>
          ) : null}

          {/* What the folder holds */}
          <details className="group text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none font-semibold hover:text-foreground transition-colors w-fit">
              {t('¿Qué hay dentro de la carpeta?')}
            </summary>
            <ul className="mt-2 space-y-1 font-mono rounded-xl border border-border bg-secondary p-3 leading-relaxed">
              <li>
                <span className="text-foreground">{MANIFEST_FILE}</span> — {t('tus carpetas, los datos de cada proyecto (como "editado hace…") y tus preferencias')}
              </li>
              <li>
                <span className="text-foreground">{t('Proyecto')}.nori.json</span> — {t('los proyectos de la raíz de Inicio')}
              </li>
              <li>
                <span className="text-foreground">{t('Carpeta')}/</span> — {t('una carpeta por cada carpeta de Inicio, con sus proyectos')}
              </li>
              <li>
                <span className="text-foreground">{TRASH_DIR}/</span> — {t('los proyectos de la papelera')}
              </li>
              <li>
                <span className="text-foreground">{BACKUPS_DIR}/</span> — {t('los respaldos .zip que Nori deja al vincular cuando se descarta un espacio de trabajo')}
              </li>
              <li>
                <span className="text-foreground">{FOREIGN_DIR}/</span> — {t('los archivos ajenos a Nori, si eliges apartarlos al vincular')}
              </li>
            </ul>
            <p className="mt-2 leading-relaxed">
              {t('Al vincular, la carpeta debe estar vacía o tener ya un espacio de trabajo de Nori. Si los archivos de la carpeta cambian fuera de Nori, recarga la página para verlos.')}
            </p>
          </details>
        </section>

        {/* Why it matters */}
        {!linked && (
          <div className="p-4 bg-bento-orange-light border border-bento-orange/30 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
            <Warning className="w-5 h-5 shrink-0 text-bento-orange" />
            <div className="text-foreground space-y-1.5">
              <span className="font-semibold block text-bento-orange">{t('Ten siempre un respaldo reciente')}</span>
              <p>
                {t('Nori no tiene servidores: tus proyectos solo existen en el almacenamiento de este navegador. Si se borran los datos del sitio, se limpia el historial, se reinstala el navegador o cambias de equipo,')}{' '}
                <strong>{t('se pierde todo lo que no hayas guardado fuera')}</strong>.
              </p>
              <p>{t('Hay tres formas de protegerte, y puedes combinarlas:')}</p>
              <ul className="space-y-1 pl-1">
                <li className="flex items-start gap-2">
                  <FolderOpen className="w-3.5 h-3.5 mt-0.5 shrink-0 text-bento-orange" />
                  <span>
                    <strong>{t('Carpeta local')}</strong>{' '}
                    {t('(arriba): tu trabajo se guarda solo en una carpeta de tu equipo.')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Stack className="w-3.5 h-3.5 mt-0.5 shrink-0 text-bento-orange" />
                  <span>
                    <strong>{t('Respaldo completo')}</strong>{' '}
                    {t('(en esta página): un solo archivo con todo el espacio de trabajo. Lo más cómodo para migrar o para guardar todo de una vez.')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <FileArrowDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-bento-orange" />
                  <span>
                    <strong>{t('JSON de cada proyecto')}</strong>
                    {t(': desde el menú "…" de un proyecto (Descargar JSON) o con Ctrl + S en el editor. Útil para guardar o compartir proyectos sueltos.')}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Create */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <DownloadSimple className="w-4 h-4 text-bento-blue" />
                {t('Crear respaldo')}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {trashed.length > 0
                  ? t('Descarga un .zip con {projects}, {trashed} de la papelera y {folders}. Dentro, cada proyecto es un JSON de Nori que también se puede abrir por separado.', {
                      projects: projectCount(projects.length),
                      trashed: projectCount(trashed.length),
                      folders: folderCount(folders.length),
                    })
                  : t('Descarga un .zip con {projects} y {folders}. Dentro, cada proyecto es un JSON de Nori que también se puede abrir por separado.', {
                      projects: projectCount(projects.length),
                      folders: folderCount(folders.length),
                    })}{' '}
                {t('Sirve para llevarte tu trabajo a otro navegador u otro equipo: allí abre Nori, ve a Almacenamiento y carga el archivo.')}
              </p>
            </div>
            <button
              onClick={handleCreate}
              disabled={isEmpty || !available}
              className="h-8 px-3 rounded-lg border bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <DownloadSimple className="w-4 h-4" />
              {t('Crear respaldo')}
            </button>
          </div>
          <div
            className={`text-[11px] flex items-center gap-1.5 ${
              lastBackup ? 'text-muted-foreground' : 'text-bento-orange font-semibold'
            }`}
          >
            {lastBackup ? <CheckCircle className="w-3.5 h-3.5 text-bento-green" /> : <Warning className="w-3.5 h-3.5" />}
            {lastBackup
              ? t('Último respaldo creado en este navegador: {time}', { time: formatRelative(lastBackup) })
              : isEmpty
                ? t('Aún no hay nada que respaldar')
                : t('Todavía no has creado ningún respaldo en este navegador')}
          </div>
        </section>

        {/* Load */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
          <div>
            <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
              <UploadSimple className="w-4 h-4 text-bento-blue" />
              {t('Cargar respaldo')}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t('Elige un respaldo de Nori (.zip) creado en este u otro navegador. Antes, decide qué hacer con lo que ya hay aquí:')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={t('Al cargar el respaldo')}>
            {modeOption(
              'merge',
              t('Mantener lo actual'),
              t('Se añaden los proyectos y carpetas del respaldo junto a los que ya tienes. Lo que ya estaba igual no se duplica.'),
              Browsers
            )}
            {modeOption(
              'replace',
              t('Reemplazar todo'),
              linked
                ? t('Se borra todo el espacio de trabajo de la carpeta vinculada (papelera incluida) y queda exactamente como en el respaldo.')
                : t('Se borra todo el espacio de trabajo de este navegador (papelera incluida) y queda exactamente como en el respaldo.'),
              ArrowsClockwise
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null || !available}
              className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === 'replace'
                  ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30'
                  : 'bg-card border-border text-foreground hover:bg-accent'
              }`}
            >
              <UploadSimple className={`w-4 h-4 ${mode === 'replace' ? '' : 'text-bento-blue'}`} />
              {busy === 'load' ? t('Cargando…') : t('Cargar respaldo')}
            </button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFile} accept=".zip,application/zip" className="hidden" />
        </section>

        {/* Clear the browser */}
        <section className="bg-card border border-destructive/30 rounded-2xl p-5 shadow-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-destructive font-heading flex items-center gap-2">
                <Broom className="w-4 h-4" />
                {t('Borrar los datos del navegador')}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {linked
                  ? t('Para no dejar rastro en este navegador, por ejemplo en un equipo compartido: borra el vínculo con la carpeta y tus preferencias. Los archivos de la carpeta no se tocan.')
                  : t('Para no dejar rastro en este navegador, por ejemplo en un equipo compartido: borra todo el espacio de trabajo (papelera incluida) y tus preferencias.')}
              </p>
            </div>
            <button
              onClick={handleClear}
              disabled={busy !== null}
              className="h-8 px-3 rounded-lg border bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Broom className="w-4 h-4" />
              {t('Borrar datos…')}
            </button>
          </div>
        </section>
      </div>

      {dialog}
      {linkDialog}
    </div>
  );
}

// ─── Linking a folder ─────────────────────────────────────────────────────────

/**
 * Choosing and linking a folder, with the questions it may need (files that aren't from
 * Nori, a workspace different from the browser's). With a folder already linked (its
 * connection was lost), the old link is replaced. The dialog must be rendered by the caller.
 */
export function useFolderLinking(onLinked: () => void) {
  const { toast, confirm } = useUI();
  const [linking, setLinking] = useState(false);
  const [dialog, setDialog] = useState<React.ReactNode>(null);

  const ask = <T,>(render: (answer: (value: T | null) => void) => React.ReactNode) =>
    new Promise<T | null>((resolve) =>
      setDialog(
        render((value) => {
          setDialog(null);
          resolve(value);
        })
      )
    );

  const handleLink = async (): Promise<void> => {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await pickFolder();
    } catch (err: any) {
      if (err?.name !== 'AbortError') toast(t('No se pudo abrir la carpeta'), 'error');
      return;
    }

    setLinking(true);
    try {
      const scan = await scanFolder(dir);

      // Files that have nothing to do with Nori: it can't be linked
      if (scan.kind === 'foreign') {
        setLinking(false);
        const again = await confirm({
          title: t('Esta carpeta no se puede vincular'),
          message:
            (scan.reason ? `${scan.reason}. ` : '') +
            t('La carpeta "{name}" tiene archivos que no son de Nori. Para continuar necesitas una carpeta vacía o una que ya contenga un espacio de trabajo de Nori.', {
              name: dir.name,
            }),
          confirmLabel: t('Elegir otra carpeta'),
        });
        if (again === true) return handleLink();
        return;
      }

      // A Nori workspace with other files next to it
      let extras: ExtrasAction = 'ignore';
      if (scan.kind === 'nori' && scan.extras.length > 0) {
        const choice = await ask<ExtrasAction>((answer) => (
          <ExtrasDialog name={dir.name} extras={scan.extras} onAnswer={answer} />
        ));
        if (!choice) return;
        extras = choice;
      }

      // A Nori workspace that doesn't match the one in the browser
      let resolution: LinkResolution = 'browser';
      if (scan.kind === 'nori') {
        const browserWorkspace = readWorkspace();
        if (isWorkspaceEmpty(browserWorkspace) || sameWorkspace(browserWorkspace, scan.workspace)) {
          resolution = 'folder';
        } else if (!isWorkspaceEmpty(scan.workspace)) {
          const choice = await ask<LinkResolution>((answer) => (
            <ConflictDialog
              name={dir.name}
              browserContents={contentsOf(browserWorkspace)}
              folderContents={contentsOf(scan.workspace)}
              onAnswer={answer}
            />
          ));
          if (!choice) return;
          resolution = choice;
        }
      }

      // Linking again a folder whose connection was lost: leave the old link first
      if (getStorageStatus().mode === 'folder') await unlinkFolder();
      const backups = await linkFolder(dir, scan, { resolution, extras });
      onLinked();
      const workspace = readWorkspace();
      toast(
        backups.length > 0
          ? t('Carpeta "{name}" vinculada con {contents}. El espacio de trabajo descartado quedó en {dir}/{file}', {
              name: dir.name,
              contents: contentsOf(workspace),
              dir: BACKUPS_DIR,
              file: backups[0],
            })
          : t('Carpeta "{name}" vinculada con {contents}', { name: dir.name, contents: contentsOf(workspace) }),
        'success'
      );
    } catch (err: any) {
      console.warn('Nori: linking a folder', err);
      toast(err instanceof FolderError ? err.message : t('No se pudo vincular la carpeta'), 'error');
    } finally {
      setLinking(false);
    }
  };

  return { link: handleLink, linking, dialog };
}

// ─── Option card ──────────────────────────────────────────────────────────────

interface OptionCardProps {
  name: string;
  active: boolean;
  danger?: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
  Icon: React.ElementType;
}

function OptionCard({ name, active, danger, onSelect, title, desc, Icon }: OptionCardProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
        active
          ? danger
            ? 'border-destructive/50 bg-destructive/5'
            : 'border-bento-blue/50 bg-bento-blue-light'
          : 'border-border bg-secondary hover:bg-accent'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={active}
        onChange={onSelect}
        className={`mt-0.5 ${danger ? 'accent-destructive' : 'accent-bento-blue'}`}
      />
      <span className="min-w-0">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${active && danger ? 'text-destructive' : 'text-foreground'}`}>
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {title}
        </span>
        <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</span>
      </span>
    </label>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

interface DialogShellProps {
  title: string;
  Icon: React.ElementType;
  danger?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

function DialogShell({ title, Icon, danger, onClose, children, footer }: DialogShellProps) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in select-none"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-lg mx-4 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 shrink-0 ${danger ? 'text-destructive' : 'text-bento-blue'}`} />
            <h2 className="text-sm font-bold text-foreground font-heading">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={t('Cancelar')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3 overflow-y-auto text-xs text-muted-foreground leading-relaxed">{children}</div>
        <div className="flex gap-2 px-5 pb-5 justify-end shrink-0">{footer}</div>
      </div>
    </div>
  );
}

const secondaryButton =
  'px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer';
const primaryButton = (danger?: boolean) =>
  `px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
    danger ? 'bg-destructive hover:opacity-90 text-white' : 'bg-primary hover:opacity-90 text-primary-foreground'
  }`;

/** The folder has a Nori workspace plus files that aren't part of it */
function ExtrasDialog({
  name,
  extras,
  onAnswer,
}: {
  name: string;
  extras: ForeignEntry[];
  onAnswer: (value: ExtrasAction | null) => void;
}) {
  const [choice, setChoice] = useState<ExtrasAction>('ignore');
  const shown = extras.slice(0, 8);
  return (
    <DialogShell
      title={t('Hay archivos que no son de Nori')}
      Icon={Warning}
      onClose={() => onAnswer(null)}
      footer={
        <>
          <button onClick={() => onAnswer(null)} className={secondaryButton}>
            {t('Cancelar')}
          </button>
          <button onClick={() => onAnswer(choice)} className={primaryButton(choice === 'delete')}>
            {t('Vincular carpeta')}
          </button>
        </>
      }
    >
      <p>
        {extras.length === 1
          ? t('La carpeta "{name}" tiene un espacio de trabajo de Nori, pero también un elemento que no forma parte de él:', { name })
          : t('La carpeta "{name}" tiene un espacio de trabajo de Nori, pero también {count} elementos que no forman parte de él:', {
              name,
              count: extras.length,
            })}
      </p>
      <ul className="rounded-xl border border-border bg-secondary p-2.5 font-mono text-[11px] space-y-0.5">
        {shown.map((extra) => (
          <li key={extra.path} className="flex items-center gap-1.5 truncate text-foreground">
            {extra.kind === 'directory' ? (
              <FolderSimple className="w-3.5 h-3.5 shrink-0 text-bento-yellow" weight="fill" />
            ) : (
              <FileArrowDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{extra.path}</span>
          </li>
        ))}
        {extras.length > shown.length && (
          <li className="text-muted-foreground">{t('y {count} más', { count: extras.length - shown.length })}</li>
        )}
      </ul>
      <p>{t('¿Qué quieres hacer con ellos?')}</p>
      <div className="space-y-2" role="radiogroup">
        <OptionCard
          name="extras"
          active={choice === 'ignore'}
          onSelect={() => setChoice('ignore')}
          title={t('Ignorarlos')}
          desc={t('Se quedan donde están y Nori no los toca.')}
          Icon={EyeSlash}
        />
        <OptionCard
          name="extras"
          active={choice === 'move'}
          onSelect={() => setChoice('move')}
          title={t('Moverlos a una subcarpeta')}
          desc={t('Se apartan en la subcarpeta {dir}, dentro de la carpeta vinculada.', { dir: FOREIGN_DIR })}
          Icon={FolderDashed}
        />
        <OptionCard
          name="extras"
          active={choice === 'delete'}
          danger
          onSelect={() => setChoice('delete')}
          title={t('Eliminarlos')}
          desc={t('Se borran de tu equipo de forma permanente. Esta acción no se puede deshacer.')}
          Icon={TrashSimple}
        />
      </div>
    </DialogShell>
  );
}

/** The folder has a Nori workspace different from the one in the browser */
function ConflictDialog({
  name,
  browserContents,
  folderContents,
  onAnswer,
}: {
  name: string;
  browserContents: string;
  folderContents: string;
  onAnswer: (value: LinkResolution | null) => void;
}) {
  const [choice, setChoice] = useState<LinkResolution>('merge');
  return (
    <DialogShell
      title={t('La carpeta ya tiene otro espacio de trabajo')}
      Icon={ArrowsMerge}
      onClose={() => onAnswer(null)}
      footer={
        <>
          <button onClick={() => onAnswer(null)} className={secondaryButton}>
            {t('Cancelar')}
          </button>
          <button onClick={() => onAnswer(choice)} className={primaryButton()}>
            {t('Vincular carpeta')}
          </button>
        </>
      }
    >
      <p>
        {t('La carpeta "{name}" tiene un espacio de trabajo de Nori ({folder}) distinto del de este navegador ({browser}). ¿Cuál quieres conservar?', {
          name,
          folder: folderContents,
          browser: browserContents,
        })}
      </p>
      <div className="space-y-2" role="radiogroup">
        <OptionCard
          name="conflict"
          active={choice === 'merge'}
          onSelect={() => setChoice('merge')}
          title={t('Combinar los dos')}
          desc={t('Los proyectos y carpetas del navegador se añaden a los de la carpeta. Lo que ya estaba igual no se duplica.')}
          Icon={ArrowsMerge}
        />
        <OptionCard
          name="conflict"
          active={choice === 'browser'}
          onSelect={() => setChoice('browser')}
          title={t('El del navegador sobrescribe la carpeta')}
          desc={t('La carpeta queda exactamente como tu espacio de trabajo del navegador.')}
          Icon={Browsers}
        />
        <OptionCard
          name="conflict"
          active={choice === 'folder'}
          onSelect={() => setChoice('folder')}
          title={t('El de la carpeta sobrescribe el navegador')}
          desc={t('Se usa el espacio de trabajo de la carpeta y se descarta el del navegador.')}
          Icon={FolderOpen}
        />
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-border bg-secondary p-2.5 text-[11px]">
        <Stack className="w-3.5 h-3.5 shrink-0 mt-px text-bento-blue" />
        {choice === 'browser'
          ? t('Antes se guarda un respaldo .zip del espacio de trabajo de la carpeta en {dir}.', { dir: BACKUPS_DIR })
          : t('Antes se guarda un respaldo .zip del espacio de trabajo del navegador en {dir}, dentro de la carpeta.', { dir: BACKUPS_DIR })}
      </p>
    </DialogShell>
  );
}

/** Confirmation to clear everything Nori keeps in this browser */
function ClearBrowserDialog({
  linkedFolder,
  canBackup,
  onBackup,
  onAnswer,
}: {
  linkedFolder: string | null;
  canBackup: boolean;
  onBackup: () => boolean;
  onAnswer: (value: true | null) => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  return (
    <DialogShell
      title={t('Borrar los datos del navegador')}
      Icon={Warning}
      danger
      onClose={() => onAnswer(null)}
      footer={
        <>
          <button onClick={() => onAnswer(null)} className={secondaryButton}>
            {t('Cancelar')}
          </button>
          <button onClick={() => onAnswer(true)} disabled={!understood} className={primaryButton(true)}>
            {t('Borrar todo')}
          </button>
        </>
      }
    >
      <p>
        {linkedFolder
          ? t('Se borrará todo lo que Nori guarda en este navegador: el vínculo con la carpeta "{name}", tus preferencias (idioma, tema, avisos cerrados) y la vista en la que lo dejaste. Los archivos de la carpeta no se tocan; podrás volver a vincularla cuando quieras.', {
              name: linkedFolder,
            })
          : t('Se borrará todo lo que Nori guarda en este navegador: todos tus proyectos (también los de la papelera), tus carpetas, tus preferencias (idioma, tema, avisos cerrados) y la vista en la que lo dejaste.')}
      </p>
      <p>{t('Al terminar, la página se recarga vacía, sin el proyecto de ejemplo.')}</p>

      <div className="rounded-xl border border-border bg-secondary p-3 flex items-center gap-3">
        <Stack className="w-5 h-5 shrink-0 text-bento-blue" />
        <p className="flex-1 text-[11px]">
          {canBackup
            ? t('¿Quieres conservar una copia? Descarga antes un respaldo .zip con todo tu espacio de trabajo.')
            : t('No hay proyectos que respaldar.')}
        </p>
        <button
          onClick={() => {
            if (onBackup()) setBackedUp(true);
          }}
          disabled={!canBackup}
          className="h-8 px-3 rounded-lg border bg-card border-border text-foreground hover:bg-accent text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {backedUp ? <CheckCircle className="w-4 h-4 text-bento-green" /> : <DownloadSimple className="w-4 h-4 text-bento-blue" />}
          {backedUp ? t('Respaldo descargado') : t('Descargar respaldo')}
        </button>
      </div>

      <label className="flex items-start gap-2.5 p-3 rounded-xl border border-destructive/30 bg-destructive/5 cursor-pointer">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 accent-destructive"
        />
        <span className="text-[11px] text-foreground font-semibold">{t('Entiendo que esta acción no se puede deshacer')}</span>
      </label>
    </DialogShell>
  );
}
