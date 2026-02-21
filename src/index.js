const crypto = require('crypto');
global.crypto = crypto;

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Variáveis globais
let currentQR = null;
let connectionStatus = 'Desconectado';
let qrCodeData = null;
let pairingCode = null;

// Servidor web
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.url === '/') {
        res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache'
        });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bot WhatsApp - Conectar</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="3">
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .container {
                        text-align: center;
                        padding: 30px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
                        max-width: 450px;
                        width: 90%;
                    }
                    h1 { 
                        color: #fff; 
                        margin-bottom: 20px; 
                        font-size: 28px;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                    }
                    .status {
                        padding: 15px 30px;
                        border-radius: 50px;
                        margin: 20px 0;
                        font-weight: bold;
                        font-size: 16px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .status.conectado { background: #00d26a; }
                    .status.desconectado { background: #ff4757; }
                    .status.aguardando { background: #ffa502; color: #333; }
                    #qrcode {
                        background: white;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        width: 280px;
                        height: 280px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    }
                    #qrcode img {
                        max-width: 240px;
                        max-height: 240px;
                    }
                    .pairing-code {
                        background: #00d26a;
                        color: white;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px 0;
                        font-size: 32px;
                        font-weight: bold;
                        letter-spacing: 10px;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    }
                    .info {
                        margin-top: 20px;
                        color: #f0f0f0;
                        font-size: 14px;
                        line-height: 1.8;
                    }
                    .loading {
                        font-size: 18px;
                        color: #666;
                        text-align: center;
                        padding: 30px;
                    }
                    .warning {
                        background: #ffa502;
                        color: #333;
                        padding: 15px;
                        border-radius: 10px;
                        margin-bottom: 20px;
                        font-weight: bold;
                        font-size: 14px;
                    }
                    .steps {
                        text-align: left;
                        background: rgba(255,255,255,0.1);
                        padding: 15px;
                        border-radius: 10px;
                        margin-top: 15px;
                    }
                    .steps p {
                        margin: 8px 0;
                        font-size: 13px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Bot de Rifas - WhatsApp</h1>
                    
                    ${!qrCodeData && !pairingCode && connectionStatus !== 'Conectado' ? 
                        '<div class="warning">⚡ Gerando método de conexão...</div>' : ''}
                    
                    <div class="status ${connectionStatus === 'Conectado' ? 'conectado' : connectionStatus === 'Aguardando QR' ? 'aguardando' : 'desconectado'}">
                        ${connectionStatus}
                    </div>

                    ${pairingCode ? `
                        <div style="margin: 20px 0;">
                            <p style="font-size: 18px; margin-bottom: 10px;">📱 Código de Pareamento:</p>
                            <div class="pairing-code">${pairingCode}</div>
                            <p style="font-size: 12px; margin-top: 10px;">Abra WhatsApp → Configurações → Dispositivos → Link com código</p>
                        </div>
                    ` : ''}

                    <div id="qrcode">
                        ${qrCodeData ? 
                            `<img src="${qrCodeData}" alt="QR Code">` : 
                            `<div class="loading">
                                ${pairingCode ? '⏳ Ou use o código acima' : '⏳ Gerando QR Code...'}
                            </div>`
                        }
                    </div>

                    <div class="info">
                        <div class="steps">
                            <p><strong>📱 Como conectar:</strong></p>
                            <p>1. Abra o WhatsApp no celular</p>
                            <p>2. Toque em ⋮ (menu) → Dispositivos Conectados</p>
                            <p>3. Escolha: "Conectar novo dispositivo"</p>
                            <p>4. Escaneie o QR Code ou use o código de 8 dígitos</p>
                        </div>
                        <p style="margin-top: 15px; font-size: 11px;">⏱️ Atualizando automaticamente...</p>
                    </div>
                </div>
            </body>
            </html>
        `);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor: http://0.0.0.0:${PORT}`);
    console.log(`🔗 URL Pública: https://bot-de-automo-o-muniz-rifas-production.up.railway.app`);
});

// Limpa sessão anterior para forçar nova conexão
const authPath = path.join(process.cwd(), 'auth_info');
if (fs.existsSync(authPath)) {
    try {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('🗑️ Sessão limpa');
    } catch (e) {
        console.log('⚠️ Erro ao limpar sessão:', e.message);
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
        this.maxReconnectAttempts = 10;
    }

    async start() {
        try {
            logger.info('🤖 Iniciando Bot de Rifas...');
            logger.info(`👑 Admin: ${config.ADMIN_NUMBER}`);

            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            // CONFIGURAÇÃO "BOT DE RIFAS" - USA MOBILE EM VEZ DE WEB
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger: logger.child({ level: 'silent' }), // Silencia logs excessivos
                browser: ['Android', 'Chrome', '110.0.5481.154'], // Finge ser Android
                connectTimeoutMs: 120000, // 2 minutos timeout
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: false, // Não marca online imediatamente
                syncFullHistory: false, // Não sincroniza histórico completo
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                linkPreviewImageThumbnailWidth: 1920,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    );
                    if (requiresPatch) {
                        message = {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadataVersion: 2,
                                        deviceListMetadata: {},
                                    },
                                    ...message,
                                },
                            },
                        };
                    }
                    return message;
                },
                getMessage: async () => {
                    return { conversation: 'hello' };
                },
            });

            this.messageHandler = new MessageHandler(this.sock);

            // SOLICITA CÓDIGO DE PAREAMENTO (método dos bots de rifa)
            if (!state.creds.registered) {
                console.log('📱 Solicitando código de pareamento...');
                const phoneNumber = '5571988140188'; // Seu número
                try {
                    const code = await this.sock.requestPairingCode(phoneNumber);
                    pairingCode = code;
                    console.log(`🔢 Código de pareamento: ${code}`);
                    logger.info('Código de pareamento gerado!');
                } catch (err) {
                    console.log('⚠️ Erro no código de pareamento:', err.message);
                }
            }

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    try {
                        qrCodeData = await QRCode.toDataURL(qr);
                        currentQR = qr;
                        connectionStatus = 'Aguardando QR';
                        logger.info('📱 QR Code gerado!');
                        qrcode.generate(qr, { small: true });
                    } catch (err) {
                        logger.error('Erro QR:', err);
                    }
                }

                if (connection === 'close') {
                    currentQR = null;
                    qrCodeData = null;
                    pairingCode = null;
                    connectionStatus = 'Desconectado';
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    
                    logger.info(`Conexão fechada. Código: ${statusCode}`);
                    
                    // Se for erro 405 ou 401, limpa sessão e tenta novamente
                    if (statusCode === 405 || statusCode === 401) {
                        logger.info('🔄 Erro de autenticação, limpando sessão...');
                        if (fs.existsSync(authPath)) {
                            fs.rmSync(authPath, { recursive: true, force: true });
                        }
                    }
                    
                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        logger.info(`🔄 Reconectando... ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                        setTimeout(() => this.start(), 10000); // Espera 10s antes de reconectar
                    } else {
                        logger.error('❌ Máximo de tentativas atingido');
                    }
                }

                if (connection === 'open') {
                    currentQR = null;
                    qrCodeData = null;
                    pairingCode = null;
                    connectionStatus = 'Conectado';
                    this.reconnectAttempts = 0;
                    logger.info('✅ Bot conectado!');
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
                logger.error('Erro:', error.message);
            });

        } catch (error) {
            logger.error('Erro fatal:', error);
            setTimeout(() => this.start(), 15000); // Tenta novamente em 15s
        }
    }
}

const bot = new WhatsAppBot();
bot.start();

process.on('uncaughtException', (error) => {
    logger.error('Exceção:', error);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Rejeição:', reason);
});
