import { Project } from '../types/animation';
import { convertLottieToProject } from './lottieImporter';
import { ASTERISCO_RAW_LOTTIE_JSON } from './asteriscoLottieData';
import { DIORVI_RAW_LOTTIE_JSON } from './diorviLottieData';

// Dynamically generate the asterisco and diorvi projects from authentic Lottie JSONs
export function createAsteriscoProject(): Project {
  return convertLottieToProject(JSON.parse(ASTERISCO_RAW_LOTTIE_JSON));
}

export function createDiorviProject(): Project {
  return convertLottieToProject(JSON.parse(DIORVI_RAW_LOTTIE_JSON));
}

export const ASTERISCO_PROJECT: Project = createAsteriscoProject();
export const DIORVI_PROJECT: Project = createDiorviProject();

export const UI_NOTIFICATION_PROJECT: Project = {
  id: 'project-notification',
  title: 'ui_motion_card',
  width: 800,
  height: 500,
  fps: 30,
  duration: 3,
  backgroundColor: '#0f1115',
  layers: [
    {
      id: 'bg-card',
      name: 'Card Container',
      type: 'rect',
      visible: true,
      locked: false,
      inTime: 0.2,
      outTime: 3,
      expanded: true,
      properties: {
        x: 400,
        y: 250,
        width: 380,
        height: 140,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        fill: '#1b1d24',
        stroke: '#2e323f',
        strokeWidth: 1.5,
        radius: 20,
      },
      tracks: [
        {
          property: 'scaleX',
          label: 'Scale',
          unit: '%',
          keyframes: [
            {
              id: 'k-c-s0',
              time: 0.2,
              value: 0.6,
              easing: {
                type: 'custom-spring',
                bezier: { x1: 0.2, y1: 1, x2: 0.4, y2: 1 },
                spring: { stiffness: 300, damping: 15, mass: 1 },
              },
            },
            {
              id: 'k-c-s1',
              time: 0.85,
              value: 1,
              easing: {
                type: 'custom-spring',
                bezier: { x1: 0.2, y1: 1, x2: 0.4, y2: 1 },
                spring: { stiffness: 300, damping: 15, mass: 1 },
              },
            },
          ],
        },
      ],
    },
    {
      id: 'icon-circle',
      name: 'Success Badge',
      type: 'ellipse',
      visible: true,
      locked: false,
      inTime: 0.4,
      outTime: 3,
      expanded: false,
      properties: {
        x: 270,
        y: 250,
        width: 52,
        height: 52,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        fill: '#10b981',
        stroke: 'transparent',
        strokeWidth: 0,
        radius: 26,
      },
      tracks: [],
    },
    {
      id: 'title-text',
      name: 'Title Text',
      type: 'text',
      visible: true,
      locked: false,
      inTime: 0.5,
      outTime: 3,
      expanded: false,
      properties: {
        x: 425,
        y: 238,
        width: 220,
        height: 30,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        fill: '#ffffff',
        stroke: 'transparent',
        strokeWidth: 0,
        radius: 0,
        text: 'Export Finished',
        fontSize: 20,
        fontWeight: '700',
        fontFamily: 'Sen, sans-serif',
      },
      tracks: [],
    },
  ],
};

export const PRESET_PROJECTS: { id: string; name: string; description: string; project: Project }[] = [
  {
    id: 'asterisco',
    name: 'Asterisco Motion Logo (Lottie)',
    description: 'El proyecto oficial de Nori con pétalos azules oscilantes y tipografía vectorial.',
    project: ASTERISCO_PROJECT,
  },
  {
    id: 'diorvi',
    name: 'Diorvi Character (Lottie)',
    description: 'Personaje animado de Nori con balanceo de cabeza, guiño de ojo y trazos vectoriales.',
    project: DIORVI_PROJECT,
  },
  {
    id: 'notification',
    name: 'UI Card Pop-in',
    description: 'Tarjeta flotante para interfaz de usuario con escala suave y entrada escalonada.',
    project: UI_NOTIFICATION_PROJECT,
  },
];
