# Image: hitl-runtime-web:dev
# Local docker / kind port-forward demo (browser talks to localhost:8000):
#   docker build --build-arg VITE_API_URL=http://localhost:8000 -t hitl-runtime-web:dev web/
# In-cluster DNS http://api:8000 is not reachable from the browser. Do not bake it in.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://localhost:8000
ARG VITE_API_KEY=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_KEY=$VITE_API_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
