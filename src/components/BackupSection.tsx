/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  Archive,
  DownloadSimple,
  UploadSimple,
  Warning,
  FileArrowDown,
  Browsers,
  CheckCircle,
  Stack,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { useUI } from '../lib/ui';
import { FolderMeta, ProjectMeta, writeWorkspace } from '../utils/projectStorage';
import { downloadWorkspaceBackup, readWorkspaceBackup } from '../utils/workspaceBackup';

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface BackupSectionProps {
  projects: ProjectMeta[];
  trashed: ProjectMeta[];
  folders: FolderMeta[];
  formatRelative: (timestamp: number) => string;
  /** Lists changed after loading a backup */
  onRestored: () => void;
}

export function BackupSection({ projects, trashed, folders, formatRelative, onRestored }: BackupSectionProps) {
  const { toast, confirm } = useUI();
  const [lastBackup, setLastBackup] = useState<number | null>(readLastBackup);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEmpty = projects.length + trashed.length + folders.length === 0;

  const handleCreate = () => {
    try {
      const { fileName } = downloadWorkspaceBackup();
      const now = Date.now();
      setLastBackup(now);
      try {
        localStorage.setItem(LAST_BACKUP_KEY, String(now));
      } catch {}
      toast(`Respaldo descargado: ${fileName}`, 'success');
    } catch {
      toast('No se pudo crear el respaldo', 'error');
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const backup = await readWorkspaceBackup(file);
      const contents = `${plural(backup.projects.length, 'proyecto', 'proyectos')} y ${plural(backup.folders.length, 'carpeta', 'carpetas')}`;

      if (mode === 'replace') {
        const current = projects.length + trashed.length;
        const currentText = `${plural(current, 'proyecto', 'proyectos')} (papelera incluida) y ${plural(folders.length, 'carpeta', 'carpetas')}`;
        const ok = await confirm({
          title: 'Reemplazar el espacio de trabajo',
          message: `El respaldo contiene ${contents}. Se eliminará todo lo que hay ahora en este navegador (${currentText}) y se reemplazará por el contenido del respaldo. Esta acción no se puede deshacer.`,
          confirmLabel: 'Reemplazar todo',
          variant: 'danger',
        });
        if (ok !== true) return;
      }

      const result = writeWorkspace(backup, mode);
      if (!result.ok) {
        toast('No se pudo cargar el respaldo (espacio insuficiente en el navegador). No se cambió nada.', 'error');
        return;
      }
      onRestored();
      if (mode === 'replace') {
        toast(`Espacio de trabajo reemplazado: ${contents}`, 'success');
      } else if (result.projects + result.folders === 0) {
        toast('Todo el contenido del respaldo ya estaba en este navegador', 'info');
      } else {
        toast(
          `Respaldo cargado: se añadieron ${plural(result.projects, 'proyecto', 'proyectos')} y ${plural(result.folders, 'carpeta', 'carpetas')}`,
          'success'
        );
      }
    } catch (err: any) {
      toast(err?.message || 'No se pudo leer el respaldo', 'error');
    } finally {
      setBusy(false);
    }
  };

  const modeOption = (value: ImportMode, title: string, desc: string, Icon: React.ElementType) => {
    const active = mode === value;
    const danger = value === 'replace';
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
          name="backup-mode"
          value={value}
          checked={active}
          onChange={() => setMode(value)}
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
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 select-text">
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <h1 className="text-2xl font-black text-foreground font-heading flex items-center gap-2">
            <Archive className="w-6 h-6 text-bento-blue shrink-0" />
            Respaldo
          </h1>
          <p className="text-muted-foreground text-xs mt-1.5 leading-relaxed max-w-2xl">
            Un respaldo es un archivo .zip con todo tu espacio de trabajo: cada proyecto (también los de la papelera) y tus carpetas. Sirve para llevarte tu trabajo a otro navegador u otro equipo, o para guardarlo a salvo fuera del navegador. En el otro navegador abre Nori, ve a Respaldo y carga el archivo.
          </p>
        </div>

        {/* Why it matters */}
        <div className="p-4 bg-bento-orange-light border border-bento-orange/30 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
          <Warning className="w-5 h-5 shrink-0 text-bento-orange" />
          <div className="text-foreground space-y-1.5">
            <span className="font-semibold block text-bento-orange">Ten siempre un respaldo reciente</span>
            <p>
              Nori no tiene servidores: tus proyectos solo existen en el almacenamiento de este navegador. Si se borran los datos del sitio, se limpia el historial, se reinstala el navegador o cambias de equipo, <strong>se pierde todo lo que no hayas guardado fuera</strong>.
            </p>
            <p>Hay dos formas de protegerte, y puedes usar las dos:</p>
            <ul className="space-y-1 pl-1">
              <li className="flex items-start gap-2">
                <Stack className="w-3.5 h-3.5 mt-0.5 shrink-0 text-bento-orange" />
                <span>
                  <strong>Respaldo completo</strong> (en esta página): un solo archivo con todo el espacio de trabajo. Lo más cómodo para migrar o para guardar todo de una vez.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileArrowDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-bento-orange" />
                <span>
                  <strong>JSON de cada proyecto</strong>: desde el menú "…" de un proyecto (Descargar JSON) o con Ctrl + S en el editor. Útil para guardar o compartir proyectos sueltos.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Create */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <DownloadSimple className="w-4 h-4 text-bento-blue" />
                Crear respaldo
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Descarga un .zip con {plural(projects.length, 'proyecto', 'proyectos')}
                {trashed.length > 0 && `, ${plural(trashed.length, 'proyecto', 'proyectos')} de la papelera`} y{' '}
                {plural(folders.length, 'carpeta', 'carpetas')}. Dentro, cada proyecto es un JSON de Nori que también se puede abrir por separado.
              </p>
            </div>
            <button
              onClick={handleCreate}
              disabled={isEmpty}
              className="h-8 px-3 rounded-lg border bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <DownloadSimple className="w-4 h-4" />
              Crear respaldo
            </button>
          </div>
          <div
            className={`text-[11px] flex items-center gap-1.5 ${
              lastBackup ? 'text-muted-foreground' : 'text-bento-orange font-semibold'
            }`}
          >
            {lastBackup ? <CheckCircle className="w-3.5 h-3.5 text-bento-green" /> : <Warning className="w-3.5 h-3.5" />}
            {lastBackup
              ? `Último respaldo creado en este navegador: ${formatRelative(lastBackup)}`
              : isEmpty
                ? 'Aún no hay nada que respaldar'
                : 'Todavía no has creado ningún respaldo en este navegador'}
          </div>
        </section>

        {/* Load */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card">
          <div>
            <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
              <UploadSimple className="w-4 h-4 text-bento-blue" />
              Cargar respaldo
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Elige un respaldo de Nori (.zip) creado en este u otro navegador. Antes, decide qué hacer con lo que ya hay aquí:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Al cargar el respaldo">
            {modeOption(
              'merge',
              'Mantener lo actual',
              'Se añaden los proyectos y carpetas del respaldo junto a los que ya tienes. Lo que ya estaba igual no se duplica.',
              Browsers
            )}
            {modeOption(
              'replace',
              'Reemplazar todo',
              'Se borra todo el espacio de trabajo de este navegador (papelera incluida) y queda exactamente como en el respaldo.',
              ArrowsClockwise
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-wait ${
                mode === 'replace'
                  ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30'
                  : 'bg-card border-border text-foreground hover:bg-accent'
              }`}
            >
              <UploadSimple className={`w-4 h-4 ${mode === 'replace' ? '' : 'text-bento-blue'}`} />
              {busy ? 'Cargando…' : 'Cargar respaldo'}
            </button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFile} accept=".zip,application/zip" className="hidden" />
        </section>
      </div>
    </div>
  );
}
