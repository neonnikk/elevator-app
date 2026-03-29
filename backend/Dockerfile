FROM node:20-alpine

WORKDIR /app
COPY package.json ./
# Если есть package-lock.json — используем npm ci для воспроизводимых сборок
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

EXPOSE 3015
VOLUME ["/data"]

CMD ["node", "server.js"]
