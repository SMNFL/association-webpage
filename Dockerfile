FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY server ./server
COPY scripts ./scripts
COPY ui-web-edit-tool ./ui-web-edit-tool

RUN chown -R node:node /app

USER node
EXPOSE 8080

CMD ["npm", "run", "start"]
