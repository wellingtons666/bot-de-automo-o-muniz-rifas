# Usar imagem com Chrome pré-instalado (mais rápido)
FROM browserless/chrome:latest

# Instalar Node.js 18
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar e instalar dependências primeiro (cache)
COPY package*.json ./
RUN npm install

# Copiar código
COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
