# ---- Base image ----
FROM node:20-slim

# ---- Set working directory ----
WORKDIR /app

# ---- Copy package files first (better caching) ----
COPY package.json package-lock.json ./

# ---- Install production dependencies only ----
RUN npm ci --omit=dev

# ---- Copy rest of the app ----
COPY . .

# ---- Cloud Run uses PORT env var ----
ENV PORT=8080
ENV NODE_ENV=production

# ---- Expose port (informational) ----
EXPOSE 8080

# ---- Start server ----
CMD ["npm", "start"]
