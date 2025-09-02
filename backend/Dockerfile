FROM node:20-alpine
WORKDIR /app

# 只有 package*.json 就先裝依賴
COPY package*.json ./
RUN npm install --omit=dev

# 再拷貝原始碼
COPY . .
ENV NODE_ENV=production

# 若你的後端入口是 server.js 就維持這行
CMD ["node","server.js"]
