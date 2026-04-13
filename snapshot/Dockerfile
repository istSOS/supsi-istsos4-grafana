FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ARG GECKODRIVER_VERSION=v0.36.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    cron \
    firefox-esr \
    wget \
    ca-certificates \
    tar \
    gzip \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libasound2 \
    libx11-xcb1 \
    libxt6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libnss3 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-bin \
    && wget -O /tmp/geckodriver.tar.gz "https://github.com/mozilla/geckodriver/releases/download/${GECKODRIVER_VERSION}/geckodriver-${GECKODRIVER_VERSION}-linux64.tar.gz" \
    && tar -xzf /tmp/geckodriver.tar.gz -C /usr/local/bin \
    && chmod +x /usr/local/bin/geckodriver \
    && rm -f /tmp/geckodriver.tar.gz \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir requests selenium

COPY grafana_snapshot.py /usr/local/bin/grafana_snapshot.py
RUN chmod +x /usr/local/bin/grafana_snapshot.py

COPY crontab /etc/cron.d/my-cron
RUN chmod 0644 /etc/cron.d/my-cron \
    && sed -i 's/\r$//' /etc/cron.d/my-cron \
    && echo "" >> /etc/cron.d/my-cron

RUN touch /var/log/cron.log

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]