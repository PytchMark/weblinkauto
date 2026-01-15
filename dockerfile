# ---- Base image ----
FROM node:20-slim

# ---- Create app directory ----
WORKDIR /app

# ---- Install deps (better caching + reproducible) ----
# Copy both package.json and lockfile first
COPY package.json package-lock.json ./

# Use npm ci for consistent installs; omit dev deps for production
RUN npm ci --omit=dev

# ---- Copy rest of the app ----
COPY . .

# ---- Environment ----
ENV NODE_ENV=production
ENV PORT=8080

# ---- Security: run as non-root ----
RUN useradd --user-group --create-home --shell /bin/false appuser \
  && chown -R appuser:appuser /app
USER appuser

# ---- Expose port (Cloud Run uses PORT env var) ----
EXPOSE 8080

# ---- Start server ----
CMD ["node", "server.js"]
