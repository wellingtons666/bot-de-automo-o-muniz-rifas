# ============================================
# DOCKERFILE - MUNIIZ RIFAS BOT
# Otimizado para Railway.app
# ============================================

FROM node:18-slim

# Evita prompts interativos durante build
ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=8080

# Instala dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chrome/Chromium
    chromium \
    chromium-sandbox \
    # Fontes para renderização correta
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    fonts-liberation \
    fonts-noto-color-emoji \
    # Bibliotecas necessárias
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    # Utilitários
    ca-certificates \
    curl \
    wget \
    gnupg \
    # Limpa cache
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Cria usuário não-root para segurança
RUN groupadd -r botuser && useradd -r -g botuser -G audio,video botuser \
    && mkdir -p /home/botuser/Downloads \
    && chown -R botuser:botuser /home/botuser

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de dependência primeiro (cache otimizado)
COPY package*.json ./

# Instala dependências Node.js
RUN npm ci --only=production \
    && npm cache clean --force \
    && chown -R botuser:botuser /app

# Copia código da aplicação
COPY --chown=botuser:botuser . .

# Cria diretórios necessários com permissões corretas
RUN mkdir -p auth_info logs \
    && chown -R botuser:botuser /app \
    && chmod -R 755 /app \
    # Permissões especiais para Chromium sandbox
    && chmod 4755 /usr/lib/chromium/chrome-sandbox || true

# Script de entrypoint para limpeza inicial
RUN echo '#!/bin/sh\n\
echo "🧹 Limpando sessões antigas..."\n\
rm -rf /app/auth_info/* /app/session/* /tmp/puppeteer* /tmp/.X11-unix/* 2>/dev/null || true\n\
echo "🚀 Iniciando bot..."\n\
exec "$@"' > /entrypoint.sh \
    && chmod +x /entrypoint.sh

# Define usuário não-root
USER botuser

# Expõe porta
EXPOSE 8080

# Healthcheck para Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

# Entrypoint e comando
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start"]
