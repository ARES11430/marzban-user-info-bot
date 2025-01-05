FROM node:18-alpine

WORKDIR /app

# Install nano for easier file editing
RUN apk add --no-cache nano

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

RUN npm prune --production

CMD ["node", "dist/app.js"]