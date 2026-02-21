const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Servidor web para exibir QR Code
let currentQR = null;
let connectionStatus = 'Desconectado';

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bot WhatsApp - QR Code</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                    }
                    h1 { color: #00d9ff; }
                    .status {
                        padding: 10px 20px;
                        border-radius: 20px;
                        margin: 20px 0;
                        font-weight: bold;
                    }
                    .status.conectado { background: #00d9ff; color: #1a1a2e; }
                    .status.desconectado { background: #ff4757; }
                    .status.aguardando { background: #ffa502; color: #1a1a2e; }
                    #qrcode {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .info {
                        margin-top: 20px;
                        color: #a4b0be;
                        font-size: 14px;
                    }
                    .refresh {
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: #00d9ff;
                        color: #1a1a2e;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Bot WhatsApp - Menções</h1>
                    <div class="status ${connectionStatus === 'Conectado' ? 'conectado' : connectionStatus === 'Aguardando QR' ? 'aguardando' : 'desconectado'}">
                        Status: ${connectionStatus}
                    </div>
                    <div id="qrcode">
                        ${currentQR ? `<img src="${currentQR}" alt="QR Code" style="max-width: 300px;">` : '<p>Aguardando QR Code...</p>'}
                    </div>
                    <div class="info">
                        <p>⏱️ O QR Code atualiza a cada 20 segundos</p>
                        <p>📱 Abra o WhatsApp → Configurações → Dispositivos Conectados</p>
                    </div>
                    <button class="refresh" onclick="location.reload()">🔄 Atualizar Página</button>
                </div>
                <script>
                    setTimeout(() => location.reload(), 20000);
                </script>
            </body>
            </html>
        `);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
    console.log(`🔗 URL: https://seu-projeto-railway.up.railway.app`);
});

// Garante que o diretório auth_info existe
const authPath = path.join(process.cwd(), 'auth_info');
if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
}

const config = require('./config/index.js');
const MessageHandler = require('./handlers/messageHandler.js');
const logger = require('./utils/logger.js');

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
                keepAliveIntervalMs: 30000
            });

            this.messageHandler = new MessageHandler(this.sock);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    // Gera QR Code em base64 para exibir na web
                    const QRCode = require('qrcode');
                    currentQR = await QRCode.toDataURL(qr);
                    connectionStatus = 'Aguardando QR';
                    logger.info('📱 QR Code gerado! Acesse a URL para escanear');
                }

                if (connection === 'close') {
                    currentQR = null;
                    connectionStatus = 'Desconectado';
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        logger.info(`🔄 Reconectando... Tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                        setTimeout(() => this.start(), 5000);
                    } else {
                        logger.error('❌ Conexão encerrada.');
                        process.exit(1);
                    }
                }

                if (connection === 'open') {
                    currentQR = null;
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
