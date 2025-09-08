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

# 安裝 iconv + uchardet + file
RUN apk add --no-cache gnu-libiconv uchardet file

# 統一轉 UTF-8 並去 BOM（只轉文字檔）
RUN set -eux; \
  find app -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.html" \) -print0 \
  | while IFS= read -r -d '' f; do \
      enc="$(uchardet "$f" || echo UTF-8)"; \
      if [ "$enc" != "UTF-8" ]; then \
        iconv -f "$enc" -t UTF-8 "$f" -o "$f.tmp" && mv "$f.tmp" "$f"; \
      fi; \
      sed -i '1s/^\xEF\xBB\xBF//' "$f"; \
    done


RUN npm run build
EXPOSE 3000
CMD ["npm","start"]
