# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# [신설: 2026-11-10 12:21, 김병현 작성] 홈서버 k3s 배포용 Dockerfile 신규 작성.
#   Vite 정적 빌드 -> nginx-unprivileged(uid 101, 8080)로 서빙. 쿠버네티스 파드는 runAsUser: 101 로 숫자 지정한다.
#   위 check=skip 은 ARG 이름에 KEY 가 들어가서 뜨는 경고를 끈 것. Supabase anon 키는 원래 브라우저에 공개되는 값이다.

ARG NODE_VERSION=26.13.0-slim

########################################
# 1) 빌드 (Vite)
########################################
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite 는 빌드 시점에 환경변수를 코드에 "박아넣는다"(런타임 주입 불가).
# 그래서 Supabase 주소·anon 키를 빌드 인자로 받는다(CI 는 GitHub repo 변수에서 넘김).
# 비어 있으면 게임이 'YOUR_SUPABASE_URL' 로 접속하려다 깨지므로 여기서 미리 빌드를 실패시킨다.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
	|| { echo "빌드 인자 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 비어 있음"; exit 1; }
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
