import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { allTools } from '../src/tools/index.js';

describe('tool definitions', () => {
  it('exposes the full aw_* tool set', () => {
    const names = allTools.map((t) => t.name).sort();
    expect(names).toEqual([
      'aw_committee_memberships',
      'aw_election_programs',
      'aw_get_politician',
      'aw_list_structure',
      'aw_politician_profile',
      'aw_poll_tally',
      'aw_query',
      'aw_search_politicians',
      'aw_search_polls',
      'aw_sidejobs',
      'aw_voting_record'
    ]);
  });

  it('every tool has the fields MCP registration requires', () => {
    for (const tool of allTools) {
      expect(typeof tool.name, `name`).toBe('string');
      expect(tool.name.startsWith('aw_'), `${tool.name} prefix`).toBe(true);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema).toBe('object');
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('tool names are unique', () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('registers cleanly on an McpServer with descriptions', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' }, { instructions: 'x' });
    for (const tool of allTools) {
      server.tool(tool.name, tool.description, tool.inputSchema, { readOnlyHint: true }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    }
    const reg = server._registeredTools?.aw_poll_tally;
    expect(reg).toBeTruthy();
    expect(reg.description).toBe(allTools.find((t) => t.name === 'aw_poll_tally').description);
  });

  it('selector tools error cleanly without a name or id', async () => {
    for (const name of ['aw_voting_record', 'aw_sidejobs', 'aw_committee_memberships']) {
      const tool = allTools.find((t) => t.name === name);
      const res = await tool.handler({});
      expect(res.error || res.found === false).toBeTruthy();
    }
  });
});
