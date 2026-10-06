# Montage Studio - production image
# Vite 8 requires Node >= 20.19 / 22.12

# ---------- Stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- Stage 2: runtime (slim) ----------
# Only dist/ + vite (+ react plugin, imported by vite.config.js) are needed:
# `vite preview` serves the bundle and the media/AI proxy middlewares.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN echo '{"name":"video-montage-editor-runtime","private":true,"type":"module"}' > package.json \
 && npm install --no-audit --no-fund vite@8.3.2 @vitejs/plugin-react@6.1.1 \
 && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY vite.config.js ./
RUN mkdir -p projects_media

EXPOSE 4173
VOLUME ["/app/projects_media"]
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
