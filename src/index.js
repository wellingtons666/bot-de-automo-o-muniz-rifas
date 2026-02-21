const crypto = require('crypto');
global.crypto = crypto;

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { default: axios } = require('axios');

// Variáveis globais
let currentQR = null;
let connectionStatus = 'Desconectado';
let qrCodeData = null;
let pairingCode = null;
let wsEndpoint = null;

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
                <meta http-equiv="refresh" content="2">
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
                        max-width: 450px;
                        width: 90%;
                    }
                    h1 { color: #fff; margin-bottom: 20px; font-size: 28px; }
                    .status {
                        padding: 15px 30px;
                        border-radius: 50px;
                        margin: 20px 0;
                        font-weight: bold;
                        font-size: 16px;
                        text-transform: uppercase;
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
                    }
                    #qrcode img { max-width: 240px; max-height: 240px; }
                    .pairing-code {
                        background: #00d26a;
                        color: white;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px 0;
                        font-size: 36px;
                        font-weight: bold;
                        letter-spacing: 8px;
                    }
                    .info { margin-top: 20px; color: #f0f0f0; font-size: 14px; line-height: 1.8; }
                    .loading { font-size: 18px; color: #666; padding: 30px; }
                    .warning { background: #ffa502; color: #333; padding: 15px; border-radius: 10px; margin-bottom: 20px; font-weight: bold; }
                    .error-box { background: #ff4757; color: white; padding: 15px; border-radius: 10px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Bot de Rifas - WhatsApp</h1>
                    
                    ${!qrCodeData && !pairingCode && connectionStatus !== 'Conectado' ? 
                        '<div class="warning">⚡ Tentando conectar...</div>' : ''}
                    
                    <div class="status ${connectionStatus === 'Conectado' ? 'conectado' : connectionStatus === 'Aguardando QR' ? 'aguardando' : 'desconectado'}">
                        ${connectionStatus}
                    </div>

                    ${pairingCode ? `
                        <div style="margin: 20px 0;">
                            <p style="font-size: 18px; margin-bottom: 10px;">📱 Código:</p>
                            <div class="pairing-code">${pairingCode}</div>
                            <p style="font-size: 12px; margin-top: 10px;">WhatsApp → Configurações → Dispositivos → Link com código</p>
                        </div>
                    ` : ''}

                    <div id="qrcode">
                        ${qrCodeData ? 
                            `<img src="${qrCodeData}" alt="QR Code">` : 
                            `<div class="loading">
                                ${pairingCode ? '⏳ Use o código acima' : '⏳ Gerando...'}
                            </div>`
                        }
                    </div>

                    <div class="info">
                        <p><strong>📱 Como conectar:</strong></p>
                        <p>1. Abra WhatsApp → Configurações</p>
                        <p>2. Dispositivos Conectados</p>
                        <p>3. Conectar novo dispositivo</p>
                        <p>4. Use QR Code ou código de 8 dígitos</p>
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
});

// Limpa sessão
const authPath = path.join(process.cwd(), 'auth_info');
if (fs.existsSync(authPath)) {
    try { fs.rmSync(authPath, { recursive: true, force: true }); } catch (e) {}
}
fs.mkdirSync(authPath, { recursive: true });

const config = require('./config/index.js');
const MessageHandler = require('./handlers/messageHandler.js');
const logger = require('./utils/logger.js');
const QRCode = require('qrcode');

// Gera identidade única para evitar bloqueio
function generateDeviceIdentity() {
    const id = crypto.randomBytes(16).toString('hex');
    return {
        deviceId: id,
        deviceName: `Samsung Galaxy S${Math.floor(Math.random() * 23) + 1}`,
        osVersion: `Android ${Math.floor(Math.random() * 5) + 10}`,
        browserVersion: `Chrome/${Math.floor(Math.random() * 50) + 100}.0.${Math.floor(Math.random() * 5000)}.${Math.floor(Math.random() * 100)}`
    };
}

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.messageHandler = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
        this.deviceIdentity = generateDeviceIdentity();
    }

    async start() {
        try {
            logger.info(`🤖 Iniciando...`);
            logger.info(`📱 Dispositivo: ${this.deviceIdentity.deviceName}`);

            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            // Configuração "invisível" - imita app oficial
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false, // Desativa QR no terminal
                logger: logger.child({ level: 'silent' }),
                
                // Identidade móvel Samsung (mais comum no Brasil)
                browser: [this.deviceIdentity.deviceName, 'Android', this.deviceIdentity.osVersion],
                
                // Versão do WhatsApp Business
                version: [2, 23, 12],
                
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 30000,
                keepAliveIntervalMs: 15000,
                
                // Não marca online para evitar detecção
                markOnlineOnConnect: false,
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                
                // Configurações avançadas de conexão
                emitOwnEvents: true,
                fireInitQueries: true,
                
                // Patch para mensagens
                patchMessageBeforeSending: (msg) => msg,
                
                // Obtém mensagens do banco (vazio = nova sessão)
                getMessage: async () => undefined,
            });

            this.messageHandler = new MessageHandler(this.sock);

            // Tenta código de pareamento primeiro (mais confiável em cloud)
            if (!state.creds.registered && !state.creds.me) {
                console.log('📱 Solicitando código...');
                try {
                    // Aguarda conexão WebSocket estabilizar
                    await new Promise(r => setTimeout(r, 3000));
                    
                    const phoneNumber = '5571988140188';
                    const code = await this.sock.requestPairingCode(phoneNumber);
                    
                    if (code) {
                        pairingCode = code;
                        connectionStatus = 'Aguardando QR';
                        console.log(`🔢 Código: ${code}`);
                        logger.info('Código gerado! Digite no WhatsApp');
                    }
                } catch (err) {
                    console.log('⚠️ Código falhou, aguardando QR...');
                }
            }

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !pairingCode) {
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
                    
                    // Se erro 405, gera nova identidade e tenta novamente
                    if (statusCode === 405) {
                        logger.info('🔄 Erro 405, gerando nova identidade...');
                        this.deviceIdentity = generateDeviceIdentity();
                        
                        // Limpa sessão
                        if (fs.existsSync(authPath)) {
                            fs.rmSync(authPath, { recursive: true, force: true });
                            fs.mkdirSync(authPath, { recursive: true });
                        }
                    }
                    
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(this.reconnectAttempts * 5000, 30000); // Delay progressivo
                        logger.info(`🔄 Reconectando em ${delay/1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                        setTimeout(() => this.start(), delay);
                    } else {
                        logger.error('❌ Máximo de tentativas');
                        // Reseta e tenta indefinidamente
                        this.reconnectAttempts = 0;
                        setTimeout(() => this.start(), 60000);
                    }
                }

                if (connection === 'open') {
                    currentQR = null;
                    qrCodeData = null;
                    pairingCode = null;
                    connectionStatus = 'Conectado';
                    this.reconnectAttempts = 0;
                    logger.info('✅ CONECTADO!');
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

        } catch (error) {
            logger.error('Erro:', error.message);
            setTimeout(() => this.start(), 20000);
        }
    }
}

const bot = new WhatsAppBot();
bot.start();
