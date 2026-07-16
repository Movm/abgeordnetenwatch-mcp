# Abgeordnetenwatch MCP — lightweight Node runtime, non-root.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Movm/abgeordnetenwatch-mcp" \
      org.opencontainers.image.description="MCP server for the Abgeordnetenwatch API" \
      io.modelcontextprotocol.server.name="io.github.movm/abgeordnetenwatch-mcp"
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "src/index.js"]
