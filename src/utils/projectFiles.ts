import { Project } from '../types/animation';
import { isLottieJson, convertLottieToProject } from './lottieImporter';
import { convertSvgToProject } from './svgImporter';
import { t } from '../i18n';

/** A project read from a file, with the message shown once it opens */
export interface ImportedProject {
  project: Project;
  message: string;
}

export function createBlankProject(): Project {
  return {
    id: `project_${Date.now()}`,
    title: 'untitled_motion',
    width: 960,
    height: 540,
    fps: 30,
    duration: 3,
    backgroundColor: '#121316',
    layers: [],
  };
}

/** A Lottie animation or a Nori project, from the text of a .json file */
export function parseProjectJson(text: string, fileName: string): ImportedProject {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(t('Error al procesar el archivo JSON: {error}', { error: err?.message || t('Formato no válido') }));
  }

  if (isLottieJson(parsed)) {
    const converted = convertLottieToProject(parsed);
    return {
      project: converted,
      message: t('¡Animación Lottie importada con éxito! ({count} capas, {duration}s)', {
        count: converted.layers.length,
        duration: converted.duration,
      }),
    };
  }

  if (parsed && Array.isArray(parsed.layers) && (parsed.width || parsed.w)) {
    const project: Project = {
      id: parsed.id || `project_${Date.now()}`,
      title: parsed.title || parsed.nm || fileName.replace(/(\.nori)?\.json$/i, ''),
      width: parsed.width || parsed.w || 960,
      height: parsed.height || parsed.h || 540,
      fps: parsed.fps || parsed.fr || 30,
      duration: parsed.duration || 3,
      backgroundColor: parsed.backgroundColor || '#121316',
      layers: parsed.layers,
    };
    return { project, message: t('¡Proyecto cargado con éxito! ({title})', { title: project.title }) };
  }

  throw new Error(t('El archivo JSON no tiene un formato compatible de Lottie ni de Nori.'));
}

/** An SVG as a complete project (animated SVGs bring their tracks to the timeline) */
export async function importSvgProject(svgText: string, fileName: string): Promise<ImportedProject> {
  const title = fileName.replace(/\.svg$/i, '');
  let converted;
  try {
    converted = await convertSvgToProject(svgText, title);
  } catch (err: any) {
    throw new Error(t('No se pudo importar el SVG: {error}', { error: err?.message || t('formato no válido') }));
  }
  const { project, result } = converted;
  if (project.layers.length === 0) throw new Error(t('El SVG no contiene formas que se puedan importar'));

  const skipped = result.skipped > 0 ? t(' · {count} elementos no compatibles omitidos', { count: result.skipped }) : '';
  return {
    project,
    message: result.animated
      ? t('SVG animado importado: {count} capas, {duration}s{skipped}', {
          count: project.layers.length,
          duration: project.duration,
          skipped,
        })
      : t('SVG importado: {count} capas{skipped}', { count: project.layers.length, skipped }),
  };
}

/**
 * A frame copied from Figma with "Copy as SVG". The frame's own background (a full-size
 * rectangle at the bottom) becomes the project background.
 */
export async function importFigmaProject(svgText: string): Promise<ImportedProject> {
  let converted;
  try {
    converted = await convertSvgToProject(svgText, 'figma_frame');
  } catch (err: any) {
    throw new Error(t('No se pudo importar el frame: {error}', { error: err?.message || t('formato no válido') }));
  }
  let project = converted.project;
  const [first] = project.layers;
  const p = first?.properties;
  const isFrameBackground =
    !!first &&
    first.type === 'rect' &&
    first.tracks.length === 0 &&
    Math.abs(p.rotation) < 0.01 &&
    Math.abs(p.scaleX - 1) < 0.001 &&
    Math.abs(p.scaleY - 1) < 0.001 &&
    Math.abs(p.width - project.width) < 1 &&
    Math.abs(p.height - project.height) < 1 &&
    Math.abs(p.x - project.width / 2) < 1 &&
    Math.abs(p.y - project.height / 2) < 1 &&
    /^#[0-9a-f]{6}$/i.test(p.fill) &&
    p.stroke === 'transparent' &&
    p.opacity >= 0.999 &&
    !p.radius;
  if (isFrameBackground) {
    project = { ...project, backgroundColor: p.fill, layers: project.layers.slice(1) };
  }
  if (project.layers.length === 0 && !isFrameBackground) {
    throw new Error(t('El frame no contiene formas que se puedan importar'));
  }
  const skipped =
    converted.result.skipped > 0
      ? t(' · {count} elementos no compatibles omitidos', { count: converted.result.skipped })
      : '';
  return {
    project,
    message: t('Frame de Figma importado: {count} capas, {width} × {height} px{skipped}', {
      count: project.layers.length,
      width: project.width,
      height: project.height,
      skipped,
    }),
  };
}

/** A .json (Lottie or Nori) or .svg file chosen or dropped by the user */
export async function importProjectFile(file: File): Promise<ImportedProject> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
    return importSvgProject(await file.text(), file.name);
  }
  if (!name.endsWith('.json')) {
    throw new Error(
      t('"{name}" no es un archivo compatible: usa un proyecto de Nori o una animación Lottie (.json), o un .svg', {
        name: file.name,
      })
    );
  }
  return parseProjectJson(await file.text(), file.name);
}

export function projectFileName(project: Project) {
  return `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'nori_project'}.nori.json`;
}

/** Downloads the project as a Nori JSON file; returns the file name */
export function downloadProjectJson(project: Project): string {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = projectFileName(project);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return a.download;
}
