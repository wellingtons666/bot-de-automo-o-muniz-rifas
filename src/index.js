const crypto = require('crypto');
global.crypto = crypto;

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Variáveis globais para o servidor web
let currentQR = null;
let connectionStatus = 'Desconectado';
let qrCodeData = null;

// Servidor web para exibir QR Code - CONFIGURADO PARA RAILWAY
const server = http.createServer((req, res) => {
    // CORS headers para permitir acesso de qualquer origem
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.url === '/') {
        res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bot WhatsApp - QR Code</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="2">
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        background: #1a1a2e;
                        color: white;
                    }
                    .container {
                        text-align: center;
                        padding: 20px;
                        max-width: 500px;
                    }
                    h1 { color: #00d9ff; margin-bottom: 10px; font-size: 24px; }
                    .status {
                        padding: 15px 30px;
                        border-radius: 25px;
                        margin: 20px 0;
                        font-weight: bold;
                        font-size: 16px;
                    }
                    .status.conectado { background: #00d9ff; color: #1a1a2e; }
                    .status.desconectado { background: #ff4757; }
                    .status.aguardando { background: #ffa502; color: #1a1a2e; }
                    #qrcode {
                        background: white;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        width: 300px;
                        height: 300px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    }
                    #qrcode img {
                        max-width: 260px;
                        max-height: 260px;
                    }
                    .info {
                        margin-top: 20px;
                        color: #a4b0be;
                        font-size: 14px;
                        line-height: 1.6;
                    }
                    .loading {
                        font-size: 16px;
                        color: #666;
                        text-align: center;
                    }
                    .warning {
                        background: #ffa502;
                        color: #1a1a2e;
                        padding: 10px;
                        border-radius: 10px;
                        margin-bottom: 20px;
                        font-weight: bold;
                        font-size: 14px;
                    }
                    .url-info {
                        background: #2f3542;
                        padding: 10px;
                        border-radius: 8px;
                        margin-top: 15px;
                        font-size: 12px;
                        color: #70a1ff;
                        word-break: break-all;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Bot WhatsApp - Menções</h1>
                    ${!qrCodeData && connectionStatus !== 'Conectado' ? '<div class="warning">⚠️ Aguardando QR Code...</div>' : ''}
                    <div class="status ${connectionStatus === 'Conectado' ? 'conectado' : connectionStatus === 'Aguardando QR' ? 'aguardando' : 'desconectado'}">
                        Status: ${connectionStatus}
                    </div>
                    <div id="qrcode">
                        ${qrCodeData ? `<img src="${qrCodeData}" alt="QR Code WhatsApp">` : '<div class="loading">⏳ Gerando QR Code...<br>Aguarde...</div>'}
                    </div>
                    <div class="info">
                        <p>📱 <strong>Como conectar:</strong></p>
                        <p>1. Abra o WhatsApp no celular</p>
                        <p>2. Toque em ⋮ → Dispositivos Conectados</p>
                        <p>3. Toque em "Conectar novo dispositivo"</p>
                        <p>4. Aponte a câmera para o QR Code</p>
                        <br>
                        <p>⏱️ Atualizando a cada 2 segundos</p>
                    </div>
                    <div class="url-info">
                        🌐 ${req.headers.host || 'localhost'}
                    </div>
                </div>
            </body>
            </html>
        `);
    } else if (req.url === '/status') {
        // Endpoint JSON para verificar status
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: connectionStatus,
            hasQR: !!qrCodeData,
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Usa a porta do Railway ou 8080
const PORT = process.env.PORT || 8080;

// Inicia servidor em 0.0.0.0 para aceitar conexões externas (Railway)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
    console.log(`🔗 URL: https://bot-de-automo-o-muniz-rifas-production.up.railway.app`);
    console.log(`📊 Status: http://0.0.0.0:${PORT}/status`);
});

// Garante que o diretório auth_info existe e limpa sessão anterior
const authPath = path.join(process.cwd(), 'auth_info');
if (fs.existsSync(authPath)) {
    try {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('🗑️ Sessão anterior removida');
    } catch (e) {
        console.log('⚠️ Não foi possível remover sessão anterior');
    }
}
fs.mkdirSync(authPath, { recursive: true });

const config = require('./config/index.js');
const MessageHandler = require('./handlers/messageHandler.js');
const logger = require('./utils/logger.js');
const QRCode = require('qrcode');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.messageHandler = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async start() {
        try {
            logger.info('🤖 Iniciando Bot de Menções...');
            logger.info(`👑 Admin configurado: ${config.ADMIN_NUMBER}`);

            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger: logger.child({ level: 'warn' }),
                browser: ['Bot Menções', 'Chrome', '1.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: true
            });

            this.messageHandler = new MessageHandler(this.sock);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    try {
                        qrCodeData = await QRCode.toDataURL(qr);
                        currentQR = qr;
                        connectionStatus = 'Aguardando QR';
                        logger.info('📱 QR Code gerado! Acesse: https://bot-de-automo-o-muniz-rifas-production.up.railway.app');
                        qrcode.generate(qr, { small: true });
                    } catch (err) {
                        logger.error('Erro ao gerar QR Code:', err);
                    }
                }

                if (connection === 'close') {
                    currentQR = null;
                    qrCodeData = null;
                    connectionStatus = 'Desconectado';
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    
                    logger.info(`Conexão fechada. Código: ${statusCode}`);
                    
                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        logger.info(`🔄 Reconectando... Tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                        setTimeout(() => this.start(), 5000);
                    } else {
                        logger.error('❌ Conexão encerrada.');
                    }
                }

                if (connection === 'open') {
                    currentQR = null;
                    qrCodeData = null;
                    connectionStatus = 'Conectado';
                    this.reconnectAttempts = 0;
                    logger.info('✅ Bot conectado com sucesso!');
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const msg of messages) {
                        await this.messageHandler.handle(msg);
                    }
                }
            });

            this.sock.ev.on('error', (error) => {
                logger.error('Erro na conexão:', error);
            });

        } catch (error) {
            logger.error('Erro fatal ao iniciar bot:', error);
            process.exit(1);
        }
    }
}

const bot = new WhatsAppBot();
bot.start();

process.on('uncaughtException', (error) => {
    logger.error('Exceção não capturada:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Rejeição não tratada:', reason);
});
