import { z } from 'zod';

export const nameSchema = z.string().min(2)
  .describe('Full name of the MP, e.g. "Robert Habeck" (fuzzy CONTAINS match)');

export const politicianIdSchema = z.number().int().positive()
  .describe('Abgeordnetenwatch politician id (from aw_search_politicians)');

export const limitSchema = z.number().int().min(1).max(50).default(15)
  .describe('Maximum number of results (bounded server-side to 100)');

/** Wrap a handler so it never throws — errors become a structured result. */
export function safe(name, fn) {
  return async (params) => {
    try {
      return await fn(params);
    } catch (err) {
      return { error: true, message: err.message, tool: name };
    }
  };
}
