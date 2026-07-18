# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional sub-path hosting, e.g. --build-arg BASE_PATH=/app
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime
# SPA routing + sensible caching (config.js is never cached).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
