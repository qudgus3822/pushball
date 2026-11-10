# syntax=docker/dockerfile:1
# [신설: 2026-11-10 12:21, 김병현 작성] 홈서버 k3s 배포용 Dockerfile 신규 작성.
#   Vite 정적 빌드 -> nginx-unprivileged(uid 101, 8080)로 서빙. 쿠버네티스 파드는 runAsUser: 101 로 숫자 지정한다.
# [변경: 2026-11-10 13:18, 김병현 수정] Supabase 빌드 인자(URL, anon 키)와 그 검사를 지웠다.
#   실시간 서버 주소는 코드 기본값(wss://ws.qudgus.win)을 쓰므로 빌드 인자가 필요 없다.

ARG NODE_VERSION=26.13.0-slim

########################################
# 1) 빌드 (Vite)
########################################
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

########################################
# 2) 런타임 (nginx, 비루트)
########################################
FROM nginxinc/nginx-unprivileged:1.30.6-alpine AS runtime

# 기본 설정 대신 정적 서빙용 설정(8080, 캐시 정책)을 쓴다.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# 숫자 UID (nginx-unprivileged 의 nginx 사용자 = 101)
USER 101
EXPOSE 8080
