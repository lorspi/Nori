import React, { useEffect, useRef, useState } from 'react';
import { Project } from '../types/animation';
import { renderProjectFrame } from '../utils/renderer';
import { hasBooleanLayers, useBooleanEngine } from '../utils/booleanOps';

/** Frame shown while not playing: where the last animation ends, when things have settled */
function posterTime(project: Project): number {
  let last = 0;
  for (const layer of project.layers) {
    for (const track of layer.tracks) {
      for (const kf of track.keyframes) last = Math.max(last, kf.time);
    }
  }
  return Math.min(last, project.duration);
}

interface ProjectThumbnailProps {
  project: Project | null;
  /** Plays the animation in a loop (on hover) */
  playing?: boolean;
  className?: string;
}

/** Project preview fitted inside its box (transparent backgrounds show the checkerboard) */
export const ProjectThumbnail: React.FC<ProjectThumbnailProps> = ({ project, playing = false, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Boolean groups get their stroke and shadows once paper.js has loaded
  const booleanEngineReady = useBooleanEngine(!!project && hasBooleanLayers(project));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !project || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const scale = Math.min(canvas.width / project.width, canvas.height / project.height);
    const offsetX = (canvas.width - project.width * scale) / 2;
    const offsetY = (canvas.height - project.height * scale) / 2;
    const transparent = !project.backgroundColor || project.backgroundColor === 'transparent';

    const draw = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(offsetX, offsetY);
      try {
        renderProjectFrame(ctx, project, time, { scale, drawCheckerboard: transparent });
      } catch {
        // A damaged layer must not break the whole list
      }
    };

    if (!playing || project.duration <= 0) {
      draw(posterTime(project));
      return;
    }

    let frameId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      draw(((now - start) / 1000) % project.duration);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [project, playing, size, booleanEngineReady]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden bg-secondary ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};
