import { ExportSettings, Project } from '../types/animation';
import { GifEncoder } from './gifEncoder';
import { renderProjectFrame } from './renderer';
import { exportToAnimatedSvg } from './svgExporter';
import { prepareBooleanEngine } from './booleanOps';

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  percentage: number;
  stage: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

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

  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = (frame / totalFrames) * project.duration;

    // Render frame
    ctx.clearRect(0, 0, width, height);
    renderProjectFrame(ctx, project, currentTime, {
      scale: settings.scale,
      transparent: settings.transparent,
      backgroundColor: settings.backgroundColor,
      drawCheckerboard: false,
    });

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
        stage: `Renderizando fotograma ${frame + 1} de ${totalFrames}...`,
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
      stage: 'Comprimiendo archivo GIF...',
    });
  }

  const blob = encoder.finish();

  if (onProgress) {
    onProgress({
      frame: totalFrames,
      totalFrames,
      percentage: 100,
      stage: '¡Exportación completada!',
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
  project: Project,
  time: number,
  frameDuration: number,
  shutter: number,
  settings: ExportSettings,
  acc: Uint32Array,
  out: ImageData
) {
  const { width, height } = sampleCtx.canvas;
  const samples = motionBlurSamples(shutter);
  const span = shutter * frameDuration;
  acc.fill(0);
  for (let s = 0; s < samples; s++) {
    const t = Math.max(0, Math.min(project.duration, time + (s / (samples - 1) - 0.5) * span));
    sampleCtx.clearRect(0, 0, width, height);
    renderProjectFrame(sampleCtx, project, t, {
      scale: settings.scale,
      transparent: settings.transparent,
      backgroundColor: settings.backgroundColor,
      drawCheckerboard: false,
    });
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

  // Render initial frame
  if (!blurred) {
    renderProjectFrame(ctx, project, 0, {
      scale: settings.scale,
      transparent: settings.transparent,
      backgroundColor: settings.backgroundColor,
    });
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const currentTime = (frame / totalFrames) * project.duration;

    if (blurred) {
      recorder.pause();
      renderMotionBlurFrame(blurred.sampleCtx, project, currentTime, project.duration / totalFrames, shutter, settings, blurred.acc, blurred.out);
      recorder.resume();
      ctx.putImageData(blurred.out, 0, 0);
    } else {
      ctx.clearRect(0, 0, width, height);
      renderProjectFrame(ctx, project, currentTime, {
        scale: settings.scale,
        transparent: settings.transparent,
        backgroundColor: settings.backgroundColor,
        drawCheckerboard: false,
      });
    }

    if (onProgress) {
      onProgress({
        frame: frame + 1,
        totalFrames,
        percentage: Math.round(((frame + 1) / totalFrames) * 90),
        stage: `Grabando fotograma ${frame + 1} de ${totalFrames}...`,
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
      stage: 'Empaquetando video...',
    });
  }

  const resultBlob = await recordingPromise;

  if (onProgress) {
    onProgress({
      frame: totalFrames,
      totalFrames,
      percentage: 100,
      stage: '¡Video listo para descargar!',
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
        onProgress({ frame: 1, totalFrames: 1, percentage: 50, stage: 'Generando SVG vectorial animado...' });
      }
      const svgString = exportToAnimatedSvg(project, {
        transparent: settings.transparent,
        backgroundColor: settings.backgroundColor,
        fps: settings.fps,
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      if (onProgress) {
        onProgress({ frame: 1, totalFrames: 1, percentage: 100, stage: '¡SVG generado con éxito!' });
      }
      return { blob, filename: `${baseName}.svg` };
    }

    default:
      throw new Error(`Unsupported export format: ${settings.format}`);
  }
}
