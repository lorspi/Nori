import { ExportSettings, Project } from '../types/animation';
import { GifEncoder } from './gifEncoder';
import { renderProjectFrame } from './renderer';
import { exportToAnimatedSvg } from './svgExporter';
import { prepareBooleanEngine } from './booleanOps';
import { exportToLottie } from './lottieExporter';
import { t } from '../i18n';

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  percentage: number;
  stage: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

// ── Antialiasing ────────────────────────────────────────────────────────────

// Supersampling factors offered for GIF and video (1 = off)
export const ANTIALIAS_LEVELS = [1, 2, 4] as const;
export const DEFAULT_ANTIALIAS = 2;

// Larger canvases fail or get very slow in some browsers
const MAX_SUPERSAMPLE_SIDE = 8192;
const MAX_SUPERSAMPLE_AREA = 36_000_000;

/** Factor actually used for an output size: halved until the large canvas fits */
export function getAntialiasFactor(width: number, height: number, requested = DEFAULT_ANTIALIAS): number {
  let factor = ANTIALIAS_LEVELS.includes(requested as 1 | 2 | 4) ? requested : DEFAULT_ANTIALIAS;
  while (
    factor > 1 &&
    (width * factor > MAX_SUPERSAMPLE_SIDE || height * factor > MAX_SUPERSAMPLE_SIDE || width * height * factor * factor > MAX_SUPERSAMPLE_AREA)
  ) {
    factor /= 2;
  }
  return factor;
}

/**
 * Draws frames at the export size with antialiasing: each frame is rendered factor times larger
 * and then halved (once for 2x, twice for 4x). Every halving averages 2 × 2 pixels, so a 4x
 * frame averages 16 samples per pixel and edges come out smooth instead of jagged.
 */
function createFrameRenderer(project: Project, settings: ExportSettings, width: number, height: number) {
  const factor = getAntialiasFactor(width, height, settings.antialias);
  const options = {
    transparent: settings.transparent,
    backgroundColor: settings.backgroundColor,
    drawCheckerboard: false,
  };
  if (factor === 1) {
    return (ctx: CanvasRenderingContext2D, time: number) => {
      ctx.clearRect(0, 0, width, height);
      renderProjectFrame(ctx, project, time, { ...options, scale: settings.scale });
    };
  }

  // Canvases from the largest to the output size
  const steps: CanvasRenderingContext2D[] = [];
  for (let f = factor; f > 1; f /= 2) {
    const canvas = document.createElement('canvas');
    canvas.width = width * f;
    canvas.height = height * f;
    const stepCtx = canvas.getContext('2d');
    if (!stepCtx) throw new Error('Could not get 2d context for antialiasing');
    steps.push(stepCtx);
  }
  const halve = (from: CanvasRenderingContext2D, to: CanvasRenderingContext2D) => {
    const { width: w, height: h } = to.canvas;
    to.setTransform(1, 0, 0, 1, 0, 0);
    to.globalAlpha = 1;
    to.globalCompositeOperation = 'source-over';
    to.clearRect(0, 0, w, h);
    to.imageSmoothingEnabled = true;
    to.imageSmoothingQuality = 'high';
    to.drawImage(from.canvas, 0, 0, w, h);
  };

  return (ctx: CanvasRenderingContext2D, time: number) => {
    const big = steps[0];
    big.setTransform(1, 0, 0, 1, 0, 0);
    big.clearRect(0, 0, big.canvas.width, big.canvas.height);
    // Fills the largest canvas (width × factor, the output width rounded like the export size)
    renderProjectFrame(big, project, time, { ...options, scale: (width * factor) / project.width });
    for (let i = 1; i < steps.length; i++) halve(steps[i - 1], steps[i]);
    halve(steps[steps.length - 1], ctx);
  };
}

/**
 * Exports project to GIF with frame-by-frame precision and transparency support
 */
export async function exportToGif(
  project: Project,
  settings: ExportSettings,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const fps = Math.min(60, Math.max(10, settings.fps || 24));
  const totalFrames = Math.max(1, Math.round(project.duration * fps));
  const frameDurationMs = 1000 / fps;

  const width = Math.round(project.width * settings.scale);
  const height = Math.round(project.height * settings.scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2d context for GIF export');

  const encoder = new GifEncoder(width, height, settings.loop);
  const drawFrame = createFrameRenderer(project, settings, width, height);

  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = (frame / totalFrames) * project.duration;

    // Render frame
    drawFrame(ctx, currentTime);

    const imageData = ctx.getImageData(0, 0, width, height);
    encoder.addFrame(imageData, {
      delay: frameDurationMs,
      transparent: settings.transparent,
    });

    if (onProgress) {
      onProgress({
        frame: frame + 1,
        totalFrames,
        percentage: Math.round(((frame + 1) / totalFrames) * 90),
        stage: t('Renderizando fotograma {frame} de {total}...', { frame: frame + 1, total: totalFrames }),
      });
    }

    // Yield to UI loop
    if (frame % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  if (onProgress) {
    onProgress({
      frame: totalFrames,
      totalFrames,
      percentage: 95,
      stage: t('Comprimiendo archivo GIF...'),
    });
  }

  const blob = encoder.finish();

  if (onProgress) {
    onProgress({
      frame: totalFrames,
      totalFrames,
      percentage: 100,
      stage: t('¡Exportación completada!'),
    });
  }

  return blob;
}

// Sub-frames averaged per frame for motion blur: more when the shutter stays open longer
export const motionBlurSamples = (shutter: number) => Math.max(4, Math.min(16, Math.round(4 + shutter * 12)));

/**
 * Motion blur: renders several instants spread over the time the shutter is open (centred on
 * the frame) and averages them. Colors are averaged weighted by their alpha, so transparent
 * backgrounds keep clean edges.
 */
function renderMotionBlurFrame(
  sampleCtx: CanvasRenderingContext2D,
  drawFrame: (ctx: CanvasRenderingContext2D, time: number) => void,
  project: Project,
  time: number,
  frameDuration: number,
  shutter: number,
  acc: Uint32Array,
  out: ImageData
) {
  const { width, height } = sampleCtx.canvas;
  const samples = motionBlurSamples(shutter);
  const span = shutter * frameDuration;
  acc.fill(0);
  for (let s = 0; s < samples; s++) {
    const t = Math.max(0, Math.min(project.duration, time + (s / (samples - 1) - 0.5) * span));
    drawFrame(sampleCtx, t);
    const data = sampleCtx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      acc[i] += data[i] * a;
      acc[i + 1] += data[i + 1] * a;
      acc[i + 2] += data[i + 2] * a;
      acc[i + 3] += a;
    }
  }
  const px = out.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = acc[i + 3];
    if (a === 0) {
      px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
      continue;
    }
    px[i] = acc[i] / a;
    px[i + 1] = acc[i + 1] / a;
    px[i + 2] = acc[i + 2] / a;
    px[i + 3] = a / samples;
  }
}

/**
 * Exports project to WebM or MP4 using MediaRecorder with canvas stream
 * Supports alpha transparency with VP9!
 */
export async function exportToVideo(
  project: Project,
  settings: ExportSettings,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const fps = Math.min(60, Math.max(15, settings.fps || 30));
  const totalFrames = Math.max(1, Math.round(project.duration * fps));
  const frameIntervalMs = 1000 / fps;

  const width = Math.round(project.width * settings.scale);
  const height = Math.round(project.height * settings.scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2d context for video export');

  // Choose appropriate MIME type
  let mimeType = 'video/webm;codecs=vp9';
  if (settings.format === 'mp4') {
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
      mimeType = 'video/mp4;codecs=avc1';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else {
      // Fallback if browser does not support mp4 recording
      mimeType = 'video/webm;codecs=vp9';
    }
  } else {
    // WebM
    if (settings.transparent && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
    }
  }

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000, // 8 Mbps high quality
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordingPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const outputType = settings.format === 'mp4' && mimeType.includes('mp4') ? 'video/mp4' : 'video/webm';
      resolve(new Blob(chunks, { type: outputType }));
    };
    recorder.onerror = (e) => reject(e);
  });

  recorder.start();

  // Motion blur takes longer than a frame to compute: the recorder is paused meanwhile,
  // so the paused time is left out of the video and every frame keeps its duration
  const shutter = Math.max(0, Math.min(1, settings.motionBlur ?? 0));
  const blurred = shutter > 0
    ? (() => {
        const sample = document.createElement('canvas');
        sample.width = width;
        sample.height = height;
        const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
        if (!sampleCtx) throw new Error('Could not get 2d context for motion blur');
        return { sampleCtx, acc: new Uint32Array(width * height * 4), out: ctx.createImageData(width, height) };
      })()
    : null;

  const drawFrame = createFrameRenderer(project, settings, width, height);

  // Render initial frame
  if (!blurred) drawFrame(ctx, 0);

  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = (frame / totalFrames) * project.duration;

    if (blurred) {
      recorder.pause();
      renderMotionBlurFrame(blurred.sampleCtx, drawFrame, project, currentTime, project.duration / totalFrames, shutter, blurred.acc, blurred.out);
      recorder.resume();
      ctx.putImageData(blurred.out, 0, 0);
    } else {
      drawFrame(ctx, currentTime);
    }

    if (onProgress) {
      onProgress({
        frame: frame + 1,
        totalFrames,
        percentage: Math.round(((frame + 1) / totalFrames) * 90),
        stage: t('Grabando fotograma {frame} de {total}...', { frame: frame + 1, total: totalFrames }),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, frameIntervalMs));
  }

  recorder.stop();

  if (onProgress) {
    onProgress({
      frame: totalFrames,
      totalFrames,
      percentage: 95,
      stage: t('Empaquetando video...'),
    });
  }

  const resultBlob = await recordingPromise;

  if (onProgress) {
    onProgress({
      frame: totalFrames,
      totalFrames,
      percentage: 100,
      stage: t('¡Video listo para descargar!'),
    });
  }

  return resultBlob;
}

/**
 * Universal project exporter orchestrator
 */
export async function exportProject(
  project: Project,
  settings: ExportSettings,
  onProgress?: ProgressCallback
): Promise<{ blob: Blob; filename: string }> {
  const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const baseName = sanitize(project.title) || 'nori_animation';
  // Boolean groups need their real geometry (stroke and shadows included) in every frame
  await prepareBooleanEngine(project);

  switch (settings.format) {
    case 'gif': {
      const blob = await exportToGif(project, settings, onProgress);
      return { blob, filename: `${baseName}.gif` };
    }

    case 'webm': {
      const blob = await exportToVideo(project, settings, onProgress);
      return { blob, filename: `${baseName}.webm` };
    }

    case 'mp4': {
      const blob = await exportToVideo(project, settings, onProgress);
      return { blob, filename: `${baseName}.mp4` };
    }

    case 'svg': {
      if (onProgress) {
        onProgress({ frame: 1, totalFrames: 1, percentage: 50, stage: t('Generando SVG vectorial animado...') });
      }
      const svgString = exportToAnimatedSvg(project, {
        transparent: settings.transparent,
        backgroundColor: settings.backgroundColor,
        fps: settings.fps,
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      if (onProgress) {
        onProgress({ frame: 1, totalFrames: 1, percentage: 100, stage: t('¡SVG generado con éxito!') });
      }
      return { blob, filename: `${baseName}.svg` };
    }

    case 'lottie': {
      const { json } = exportToLottie(project, {
        fps: settings.fps,
        transparent: settings.transparent,
        backgroundColor: settings.backgroundColor,
        optimized: settings.lottieOptimized,
      });
      const blob = new Blob([json], { type: 'application/json' });
      return { blob, filename: `${baseName}${settings.lottieOptimized ? '.min' : ''}.json` };
    }

    default:
      throw new Error(`Unsupported export format: ${settings.format}`);
  }
}
