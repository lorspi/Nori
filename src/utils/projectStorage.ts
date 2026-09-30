import { Project } from '../types/animation';

// The last open project is kept in this browser so it reopens on the next visit
const STORAGE_KEY = 'nori-last-project';

export function loadLastProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const isValid =
      parsed &&
      Array.isArray(parsed.layers) &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      typeof parsed.duration === 'number';
    return isValid ? (parsed as Project) : null;
  } catch {
    // Unavailable storage (private mode, blocked site data) or corrupted data
    return null;
  }
}

/** Returns false when the project could not be stored (e.g. quota exceeded) */
export function saveLastProject(project: Project): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}
