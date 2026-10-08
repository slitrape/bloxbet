FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /data
ENV NODE_ENV=production
ENV DB_PATH=/data/bloxbet.db
EXPOSE 3000
CMD ["node", "server.js"]