# ---- Base image ----
FROM node:20-slim

# ---- Set working directory ----
WORKDIR /app

# ---- Copy package files first (better caching) ----
COPY package.json ./

# ---- Install dependencies ----
RUN npm install --omit=dev

# ---- Copy rest of the app ----
COPY . .

# ---- Expose port (documentation only; Cloud Run ignores EXPOSE but it’s good practice) ----
EXPOSE 8080

# ---- Start server ----
CMD ["node", "server.js"]
