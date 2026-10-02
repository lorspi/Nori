/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Project } from './types/animation';
import { NORI_INTRO_PROJECT } from './utils/noriIntro';
import {
  createProject,
  getLastProjectId,
  getProjectMeta,
  hasProjectIndex,
  loadProject,
  migrateLegacyProject,
  setLastProjectId,
} from './utils/projectStorage';
import { importProjectFile } from './utils/projectFiles';
import Editor from './Editor';
import Home from './components/Home';
import { useUI } from './lib/ui';

interface OpenSession {
  project: Project;
  autoplay: boolean;
}

/**
 * Reopens the last edited project. The very first time, the example project (the Nori
 * intro animation) is stored and opens playing. With no project to reopen, Inicio is shown.
 */
function getInitialSession(): OpenSession | null {
  const firstVisit = !hasProjectIndex() && !localStorageHas('nori-last-project');
  migrateLegacyProject();

  const lastId = getLastProjectId();
  const meta = lastId ? getProjectMeta(lastId) : null;
  const last = meta && !meta.deletedAt ? loadProject(meta.id) : null;
  if (last) return { project: last, autoplay: false };

  if (firstVisit) {
    const example = JSON.parse(JSON.stringify(NORI_INTRO_PROJECT)) as Project;
    const stored = createProject(example);
    if (stored) setLastProjectId(stored.id);
    // Without storage the example still opens, it just isn't kept
    return { project: stored ?? example, autoplay: true };
  }
  return null;
}

function localStorageHas(key: string) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export default function App() {
  const { toast } = useUI();
  const [session, setSession] = useState<OpenSession | null>(getInitialSession);

  const openProject = (id: string) => {
    const project = loadProject(id);
    if (!project) {
      toast('No se pudo abrir el proyecto', 'error');
      return;
    }
    setLastProjectId(id);
    setSession({ project, autoplay: false });
  };

  // New, imported and example projects are stored as a new entry and opened
  const createAndOpen = (project: Project, message: string, autoplay = false) => {
    const stored = createProject(project);
    if (!stored) {
      toast('No se pudo guardar el proyecto en el navegador (espacio insuficiente o almacenamiento bloqueado)', 'error');
      return;
    }
    setLastProjectId(stored.id);
    setSession({ project: stored, autoplay });
    toast(message, 'success');
  };

  // A .json (Nori / Lottie) or .svg file dropped anywhere opens as a new project
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        const { project, message } = await importProjectFile(file);
        createAndOpen(project, message);
      } catch (err: any) {
        toast(err?.message || 'No se pudo importar el archivo', 'error');
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  });

  if (!session) {
    return <Home onOpenProject={openProject} onCreateProject={createAndOpen} />;
  }

  return (
    <Editor
      key={session.project.id}
      initialProject={session.project}
      autoplay={session.autoplay}
      onGoHome={() => setSession(null)}
    />
  );
}
