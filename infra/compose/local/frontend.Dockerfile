# 로컬 테스트 스택 전용 프런트엔드 이미지.
# 운영은 Vercel(정적 배포)이므로 이 Dockerfile은 배포 경로가 아니다. 운영의
# "프런트와 API가 같은 오리진" 구조를 로컬에서 재현하기 위해 nginx로 감싼다.
#
# 빌드 컨텍스트는 저장소 루트다. frontend/ 밖의 ai/contracts 를 함께 복사해야 하기
# 때문이다(recognitionReadiness.ts 가 readiness.json 을 상대경로로 import 한다).

FROM node:22-alpine AS build
WORKDIR /app/frontend

# 의존성 레이어를 소스와 분리해 소스 수정 시 npm ci 를 건너뛴다.
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/scripts ./scripts
RUN npm ci

COPY frontend/index.html frontend/vite.config.ts ./
COPY frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json ./
COPY frontend/.env.production ./
COPY frontend/src ./src
COPY frontend/public ./public
# recognitionReadiness.ts -> ../../../../../ai/contracts/recognition/readiness.json
COPY ai/contracts /app/ai/contracts

# 단어 인식만 코드 기본값이 배포 호스트(wss://i15a405...)로 고정돼 있어서 로컬 실행에는
# 반드시 주입해야 한다. 나머지(API, 지문자/숫자 WS)는 .env.production 의 상대 경로와
# window.location 기반 기본값으로 같은 오리진이 그대로 도출된다.
ARG VITE_WORD_AI_WEBSOCKET_URL=ws://localhost:8081/word
ENV VITE_WORD_AI_WEBSOCKET_URL=${VITE_WORD_AI_WEBSOCKET_URL}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY infra/compose/local/nginx.conf /etc/nginx/conf.d/default.conf
