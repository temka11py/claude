// Full content for N4 → N2 days, keyed by outline slug (see program-outline.ts).
// Add a level file here as days are written; the seed makes those days playable.
import type { LevelDayContent } from '../types.js';
import { N4_DAYS } from './n4.js';

export const LEVEL_CONTENT: LevelDayContent[] = [...N4_DAYS];
