FROM node:20-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=optional --no-audit --no-fund --progress=false

# 讓 build 階段拿得到 Key 與 Map ID（Next 會在編譯時內嵌）
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
ARG NEXT_PUBLIC_GOOGLE_MAP_ID_STD
ENV NEXT_PUBLIC_GOOGLE_MAP_ID_STD=${NEXT_PUBLIC_GOOGLE_MAP_ID_STD}
ARG NEXT_PUBLIC_GOOGLE_MAP_ID_SAT
ENV NEXT_PUBLIC_GOOGLE_MAP_ID_SAT=${NEXT_PUBLIC_GOOGLE_MAP_ID_SAT}

COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm","start"]
