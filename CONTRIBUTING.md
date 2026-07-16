# Contributing

Thanks for helping improve Abgeordnetenwatch MCP.

## Local setup

Requirements: Node.js 22 and npm.

```bash
npm ci
npm test
npm start
```

The server is then available at `http://localhost:3000/mcp`; its health endpoint
is `http://localhost:3000/health`.

## Pull requests

- Keep tools read-only, bounded, and source-linked.
- Add or update tests for behavioral changes.
- Run `npm test` and build the Docker image before submitting.
- Never commit credentials or personal data.

By contributing, you agree that your contribution is licensed under MIT.
