FROM node:22-alpine
WORKDIR /app
# install server deps
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm install --omit=dev
# copy everything (static + server)
COPY . .
RUN mkdir -p /data
ENV NODE_ENV=production
ENV DB_PATH=/data/bloxbet.db
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
