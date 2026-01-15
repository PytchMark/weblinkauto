# ---- Base image ----
FROM node:20-slim

# ---- Set working directory ----
WORKDIR /app

# ---- Copy package files first (better caching) ----
COPY package.json ./

# Copy lockfile if it exists (won't fail if missing)
COPY package-lock.json ./

# ---- Install dependencies ----
# If package-lock.json exists -> npm ci
# If not -> npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---- Copy rest of the app ----
COPY . .

# ---- Cloud Run uses PORT env var ----
ENV PORT=8080

# ---- Expose port ----
EXPOSE 8080

# ---- Start server ----
CMD ["npm", "start"]
