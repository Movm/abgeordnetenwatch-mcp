import { transparencyTools } from './transparency.js';
import { pollTools } from './polls.js';
import { structureTools } from './structure.js';

export const allTools = [...transparencyTools, ...pollTools, ...structureTools];
