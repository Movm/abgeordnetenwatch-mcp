/**
 * Abgeordnetenwatch MCP Server — HTTP (StreamableHTTP) MCP over the open
 * Abgeordnetenwatch API. Stateless mode for connectors that send no session
 * header (e.g. ChatGPT), stateful sessions for Claude/Cursor.
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { config, validateConfig } from './config.js';
import { allTools } from './tools/index.js';
import { allResources, SERVER_INSTRUCTIONS } from './resources/info.js';
import { getCacheStats } from './utils/cache.js';
import { getRateLimiterStats } from './api/abgeordnetenwatch.js';
import { debug, info, error, getStats } from './utils/logger.js';

validateConfig();

const PORT = config.server.port;
const app = express();
app.use(express.json({ limit: '4mb' }));

// CORS — MCP clients are browser- and connector-driven.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Active stateful transports, keyed by session id.
const transports = {};

function humanizeTitle(name) {
  return name.replace(/^aw_/, '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function annotationsFor(name) {
  return { title: humanizeTitle(name), readOnlyHint: true, idempotentHint: true, openWorldHint: true };
}

function createMcpServer() {
  const server = new McpServer(
    { name: 'abgeordnetenwatch-mcp', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  for (const resource of allResources) {
    server.resource(resource.uri, resource.description, async () => {
      const content = await resource.handler();
      const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text }] };
    });
  }

  for (const tool of allTools) {
    server.tool(tool.name, tool.description, tool.inputSchema, annotationsFor(tool.name), async (params) => {
      const startedAt = Date.now();
      try {
        const result = await tool.handler(params);
        debug('Tool', `${tool.name} completed`, { ms: Date.now() - startedAt, isError: !!result.error });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !!result.error };
      } catch (err) {
        error('Tool', `${tool.name} failed: ${err.message}`, { ms: Date.now() - startedAt });
        return { content: [{ type: 'text', text: JSON.stringify({ error: true, message: err.message, tool: tool.name }) }], isError: true };
      }
    });
  }

  return server;
}

app.get('/', (req, res) => res.type('text/plain').send('Abgeordnetenwatch MCP Server'));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'abgeordnetenwatch-mcp',
    version: '1.0.0',
    api: 'Abgeordnetenwatch API v2 (CC0)',
    uptime: getStats().uptime,
    tools: allTools.length,
    cache: getCacheStats().apiResponses,
    rateLimiter: getRateLimiterStats()
  });
});

app.get('/info', (req, res) => {
  res.json({
    name: 'abgeordnetenwatch-mcp',
    version: '1.0.0',
    tools: allTools.map((t) => ({ name: t.name, description: t.description.split('\n')[0], annotations: annotationsFor(t.name) }))
  });
});

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId) {
    // Stateless: fresh server + transport per request.
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      error('MCP', `Request failed: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
    return;
  }

  if (isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => { transports[id] = transport; info('Session', `New session: ${id}`); },
      onsessionclosed: (id) => { delete transports[id]; info('Session', `Session closed: ${id}`); }
    });
    transport.onclose = () => { if (transport.sessionId) delete transports[transport.sessionId]; };
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session' }, id: null });
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports[sessionId];
  if (!transport) return res.status(400).send('Invalid or missing session id');
  await transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports[sessionId];
  if (!transport) return res.status(400).send('Invalid or missing session id');
  await transport.handleRequest(req, res);
});

const httpServer = app.listen(PORT, () => {
  info('Boot', `Abgeordnetenwatch MCP listening on :${PORT} (${allTools.length} tools)`);
});

function shutdown(signal) {
  info('Boot', `${signal} received, shutting down`);
  for (const id of Object.keys(transports)) {
    try { transports[id].close(); } catch { /* ignore */ }
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
