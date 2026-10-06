# Montage Studio - production image
# Vite 8 requires Node >= 20.19 / 22.12
FROM node:22-alpine

WORKDIR /app

# Install dependencies (devDependencies are needed: `vite preview` loads vite.config.js)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy sources and build the optimized bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4173

# Media downloaded by the app is persisted through a volume
VOLUME ["/app/projects_media"]

# `vite preview` serves dist/ + the media/AI proxy middlewares from vite.config.js
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
