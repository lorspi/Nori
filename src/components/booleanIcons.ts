import type { Icon } from '@phosphor-icons/react';
import { ExcludeSquare, IntersectSquare, SubtractSquare, UniteSquare } from '@phosphor-icons/react';
import { BooleanOperation } from '../types/animation';

// Icon of each boolean operation (top bar, Inspector and timeline)
export const BOOLEAN_ICONS: Record<BooleanOperation, Icon> = {
  union: UniteSquare,
  subtract: SubtractSquare,
  intersect: IntersectSquare,
  exclude: ExcludeSquare,
};
