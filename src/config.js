/**
 * Configuration for the Abgeordnetenwatch MCP Server.
 *
 * The Abgeordnetenwatch API is public (CC0, no key) and rate-limited to
 * ~30 req/min. Everything here is a live, filtered, size-bounded read.
 */

import 'dotenv/config';

export const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    publicUrl: process.env.PUBLIC_URL || null
  },

  // Abgeordnetenwatch REST API v2. No key required.
  api: {
    baseUrl: process.env.AW_BASE_URL || 'https://www.abgeordnetenwatch.de/api/v2',
    rateLimitPerMinute: parseInt(process.env.AW_RATE_LIMIT_PER_MINUTE) || 30,
    burstSize: parseInt(process.env.AW_BURST_SIZE) || 5,
    timeout: 15000,
    // Hard ceiling for any single list request — the API has no aggregate
    // endpoints, so callers must always bound their pulls.
    maxRangeEnd: 100,
    // The one exception: roll-call tallies fetch every cast vote to aggregate.
    tallyMaxVotes: 1000
  },

  // In-memory caches (utils/cache.js). MP data changes slowly.
  cache: {
    apiResponseTTL: 10 * 60 * 1000,     // 10 minutes for list responses
    entityTTL: 15 * 60 * 1000,          // 15 minutes for single entities
    metadataTTL: 24 * 60 * 60 * 1000,   // 24 hours for metadata
    maxApiResponseEntries: 500,
    maxEntityEntries: 200,
    maxMetadataEntries: 50
  }
};

export function validateConfig() {
  const errors = [];
  if (!config.api.baseUrl) errors.push('AW_BASE_URL / api.baseUrl is required');
  if (config.api.rateLimitPerMinute < 1) errors.push('AW_RATE_LIMIT_PER_MINUTE must be >= 1');
  if (errors.length) throw new Error(`Invalid config:\n- ${errors.join('\n- ')}`);
}
