/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Browsers, FolderOpen, LockKey, WarningCircle, CircleNotch } from '@phosphor-icons/react';
import { useUI } from '../lib/ui';
import {
  StorageStatus,
  getStorageStatus,
  needsFolderAttention,
  requestFolderPermission,
  useStorageStatus,
} from '../utils/folderSync';
import { t } from '../i18n';

/**
 * Asks the browser for access to the linked folder again (from a click) and tells the
 * user how it went. Inicio reads the workspace again on its own once it is open.
 */
export function useGrantFolderAccess() {
  const { toast } = useUI();
  return useCallback(async () => {
    const ok = await requestFolderPermission();
    // Read after the await: the status changed while the browser asked
    const status = getStorageStatus();
    const name = status.mode === 'folder' ? status.name : '';
    if (ok) toast(t('Carpeta "{name}" abierta', { name }), 'success');
    else if (status.mode === 'folder' && status.state === 'unavailable')
      toast(t('Se perdió la conexión con la carpeta "{name}": vuelve a vincularla', { name }), 'error');
    else toast(t('Nori necesita tu permiso para abrir la carpeta "{name}"', { name }), 'warning');
    return ok;
  }, [toast]);
}

/** What the badge and the Almacenamiento button show for each status */
export function describeStorage(status: StorageStatus) {
  if (status.mode === 'browser') {
    return {
      label: t('Navegador'),
      Icon: Browsers,
      tone: 'text-bento-orange',
      tooltip: t('Tus proyectos se guardan en el almacenamiento de este navegador. Haz clic para vincular una carpeta de tu equipo.'),
    };
  }
  switch (status.state) {
    case 'ready':
      return {
        label: t('Carpeta local'),
        Icon: FolderOpen,
        tone: 'text-bento-blue',
        tooltip: t('Tus proyectos se guardan en la carpeta "{name}" de tu equipo', { name: status.name }),
      };
    case 'loading':
      return { label: t('Abriendo carpeta…'), Icon: CircleNotch, tone: 'text-muted-foreground', tooltip: status.name };
    case 'permission':
      return {
        label: t('Permiso pendiente'),
        Icon: LockKey,
        tone: 'text-destructive',
        tooltip: t('Haz clic para dar permiso a Nori para abrir la carpeta "{name}"', { name: status.name }),
      };
    default:
      return {
        label: t('Conexión perdida'),
        Icon: WarningCircle,
        tone: 'text-destructive',
        tooltip: t('Se perdió la conexión con la carpeta "{name}". Haz clic para volver a vincularla.', { name: status.name }),
      };
  }
}

/** Where the workspace is saved, at the top right of Inicio (like Kora's "Base de datos") */
export function StorageBadge({ onOpenStorage }: { onOpenStorage: () => void }) {
  const status = useStorageStatus();
  const grant = useGrantFolderAccess();
  const attention = needsFolderAttention(status);
  const { label, Icon, tone, tooltip } = describeStorage(status);
  // With the permission pending, the click asks for it right away
  const onClick = status.mode === 'folder' && status.state === 'permission' ? grant : onOpenStorage;

  return (
    <button
      onClick={onClick}
      className="relative shrink-0 text-left text-xs font-mono bg-card border border-border hover:bg-accent p-3 pr-5 rounded-xl shadow-card transition-colors cursor-pointer"
      data-tooltip={tooltip}
      aria-label={`${t('Almacenamiento:')} ${label}. ${tooltip}`}
    >
      <div className="flex items-center gap-2 mb-1 text-muted-foreground">
        <Icon className={`w-4 h-4 ${tone} ${status.mode === 'folder' && status.state === 'loading' ? 'animate-spin' : ''}`} />
        <span>{t('Almacenamiento:')}</span>
      </div>
      <strong className={`${tone} font-semibold uppercase font-mono text-[11px] block max-w-48 truncate`}>{label}</strong>
      {attention && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />}
    </button>
  );
}
