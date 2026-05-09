FROM node:20-alpine

# better-sqlite3 — нативный модуль, требует инструментов компиляции
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3015
VOLUME ["/data"]

CMD ["node", "server.js"]
