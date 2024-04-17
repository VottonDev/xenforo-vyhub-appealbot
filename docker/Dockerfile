FROM node:20.12.1-bookworm-slim

WORKDIR /appealbot

COPY . .

RUN apt update

RUN npm install

RUN npm run build

RUN npm install -g pm2

CMD ["pm2-runtime", "./build/bot.js"]
