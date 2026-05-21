ARG grafana_version=13.1.0-25893932881-ubuntu
ARG grafana_image=grafana-enterprise

FROM node:22-alpine AS frontend-builder

WORKDIR /plugin

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM golang:1.22-alpine AS backend-builder

WORKDIR /plugin

RUN apk add --no-cache git

COPY go.mod go.sum Magefile.go ./
RUN go mod download

COPY --from=frontend-builder /plugin /plugin
RUN go install github.com/magefile/mage@v1.15.0 && mage -v

FROM grafana/${grafana_image}:${grafana_version}

ARG anonymous_auth_enabled=false
ARG app_mode=production

USER root

COPY --from=backend-builder /plugin/dist /var/lib/grafana/plugins/supsi-istsos4-datasource

RUN chown -R 472:0 /var/lib/grafana/plugins/supsi-istsos4-datasource

ENV GF_AUTH_ANONYMOUS_ENABLED="${anonymous_auth_enabled}"
ENV GF_DEFAULT_APP_MODE="${app_mode}"
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS="supsi-istsos4-datasource"

USER 472
