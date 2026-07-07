FROM node:18-alpine

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install

COPY client/package*.json ./client/
RUN cd client && npm install

COPY . .

RUN cd server && npx prisma generate
RUN cd client && npm run build

EXPOSE 3000

CMD ["node", "server/src/index.js"]
