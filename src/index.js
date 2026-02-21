const crypto = require('crypto');
global.crypto = crypto;

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const http = require('http');
const QRCode = require('qrcode');
const pino = require('pino');

// Logger simples
const logger = pino({ level: 'silent' });

// ============== CONFIGURAÇÃO DE EVASÃO ==============
const DEVICE_CONFIGS = [
    { name: 'Chrome', os: 'Windows', version: [2, 3000, 1015901307] },
    { name: 'Firefox', os: 'Windows', version: [2, 3000, 1015901307] },
    { name: 'Safari', os: 'Mac OS', version: [2, 3000, 1015901307] },
    { name: 'Edge', os: 'Windows', version: [2, 3000, 1015901307] }
];

function getRandomDevice() {
    return DEVICE_CONFIGS[Math.floor(Math.random() * DEVICE_CONFIGS.length)];
}

function generateDeviceIdentity() {
    const device = getRandomDevice();
    return {
        deviceName: device.name,
        osVersion: device.os,
        browserVersion: `${device.name}/120.0.0.0`,
        waVersion: device.version,
        deviceId: crypto.randomBytes(16).toString('hex')
    };
}

// ============== CONFIGURAÇÃO DE ADMINS ==============
const ADMIN_NUMBERS = ['5571999465875', '5571988140188'];

let connectionStatus = 'Iniciando...';
let qrCodeData = null;
let connectionAttempts = 0;

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
                <title>MUNIIZ RIFAS - Bot WhatsApp</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="refresh" content="5">
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
                    h1 { color: #fff; margin-bottom: 20px; font-size: 24px; }
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
                    .status.erro { background: #ff6b6b; animation: pulse 2s infinite; }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.7; }
                    }
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
                    .info { margin-top: 20px; color: #f0f0f0; font-size: 14px; line-height: 1.8; }
                    .loading { font-size: 18px; color: #666; padding: 30px; }
                    .error-box { background: #ff4757; color: white; padding: 15px; border-radius: 10px; margin: 20px 0; font-size: 14px; }
                    .success-box { background: #00d26a; color: white; padding: 15px; border-radius: 10px; margin: 20px 0; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 MUNIIZ RIFAS</h1>
                    
                    ${connectionStatus === 'Erro 515' ? 
                        '<div class="error-box">⚠️ Erro 515: Tentando novamente em 30s...</div>' : ''}
                    
                    ${connectionStatus === 'Conectado' ? 
                        '<div class="success-box">✅ Bot conectado! Pronto para usar.</div>' : ''}
                    
                    <div class="status ${connectionStatus === 'Conectado' ? 'conectado' : connectionStatus === 'Aguardando QR' ? 'aguardando' : connectionStatus === 'Erro 515' ? 'erro' : 'desconectado'}">
                        ${connectionStatus}
                    </div>

                    <div id="qrcode">
                        ${qrCodeData ? 
                            `<img src="${qrCodeData}" alt="QR Code">` : 
                            `<div class="loading">⏳ Gerando QR Code...</div>`
                        }
                    </div>

                    <div class="info">
                        <p><strong>📱 Como conectar:</strong></p>
                        <p>1. Abra WhatsApp no celular</p>
                        <p>2. Configurações → Dispositivos Conectados</p>
                        <p>3. Conectar novo dispositivo</p>
                        <p>4. Escaneie o QR Code acima</p>
                        <p style="margin-top: 10px; font-size: 12px; color: #ffa502;">⚠️ O QR Code expira em 45 segundos</p>
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
    console.log(`🌐 Servidor web: http://0.0.0.0:${PORT}`);
});

function cleanSession() {
    const authPath = path.join(process.cwd(), 'auth_info');
    const pathsToClean = [
        authPath,
        path.join(process.cwd(), 'baileys_auth'),
        path.join(process.cwd(), 'session'),
        '/tmp/puppeteer_dev_chrome_profile-*'
    ];
    
    pathsToClean.forEach(p => {
        try {
            if (fs.existsSync(p)) {
                fs.rmSync(p, { recursive: true, force: true });
            }
        } catch (e) {}
    });
    
    fs.mkdirSync(authPath, { recursive: true });
    return authPath;
}

const config = require('./config/index.js');
const MessageHandler = require('./handlers/messageHandler.js');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.messageHandler = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.deviceIdentity = generateDeviceIdentity();
        this.authPath = cleanSession();
    }

    async start() {
        try {
            connectionAttempts++;
            
            if (this.reconnectAttempts > 0) {
                console.log(`🧹 Limpando sessão... (tentativa ${this.reconnectAttempts})`);
                this.authPath = cleanSession();
                this.deviceIdentity = generateDeviceIdentity();
                await new Promise(r => setTimeout(r, 5000));
            }

            console.log(`🤖 Iniciando MUNIIZ RIFAS Bot...`);
            console.log(`📱 Browser: ${this.deviceIdentity.deviceName} | OS: ${this.deviceIdentity.osVersion}`);

            let version = this.deviceIdentity.waVersion;
            try {
                const { version: latestVersion } = await fetchLatestBaileysVersion();
                version = latestVersion || version;
                console.log(`📦 Versão WA: ${version.join('.')}`);
            } catch (e) {
                console.log(`📦 Versão: ${version.join('.')}`);
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger: logger,
                browser: [this.deviceIdentity.deviceName, this.deviceIdentity.osVersion, this.deviceIdentity.browserVersion],
                version: version,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 30000,
                keepAliveIntervalMs: 15000,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                emitOwnEvents: true,
                fireInitQueries: true,
                downloadHistory: false,
                patchMessageBeforeSending: (msg) => msg,
                getMessage: async () => undefined,
                retryRequestDelayMs: 5000,
                maxMsgRetryCount: 5,
                msgRetryCounterMap: new Map(),
                ignoreBroadcast: true,
                ignoreGroupMessages: false,
            });

            this.messageHandler = new MessageHandler(this.sock);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                console.log(`🔄 Status: ${connection || 'N/A'}`);

                if (qr) {
                    try {
                        console.log('📱 Gerando QR Code...');
                        qrCodeData = await QRCode.toDataURL(qr);
                        connectionStatus = 'Aguardando QR';
                        console.log('✅ QR Code gerado! Escaneie em 45 segundos.');
                        qrcode.generate(qr, { small: true });
                        
                        setTimeout(() => {
                            if (connectionStatus !== 'Conectado') {
                                console.log('⏳ QR Code expirado, gerando novo...');
                                qrCodeData = null;
                            }
                        }, 45000);
                        
                    } catch (err) {
                        console.error('❌ Erro QR:', err.message);
                    }
                }

                if (connection === 'close') {
                    qrCodeData = null;
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`❌ Conexão fechada. Código: ${statusCode}`);
                    
                    if (statusCode === 515) {
                        connectionStatus = 'Erro 515';
                        console.log('🚫 ERRO 515: Autenticação falhou.');
                        
                        if (this.reconnectAttempts > 5) {
                            console.log('⏸️ Muitas tentativas. Aguardando 5 minutos...');
                            this.reconnectAttempts = 0;
                            setTimeout(() => this.start(), 300000);
                            return;
                        }
                        
                        console.log('🔄 Tentando com nova identidade em 30s...');
                        cleanSession();
                        this.deviceIdentity = generateDeviceIdentity();
                        this.reconnectAttempts++;
                        setTimeout(() => this.start(), 30000);
                        return;
                    }
                    
                    if (statusCode === 405) {
                        connectionStatus = 'Erro 405';
                        console.log('🚫 ERRO 405: Bloqueado pelo WhatsApp.');
                        cleanSession();
                        this.deviceIdentity = generateDeviceIdentity();
                        this.reconnectAttempts++;
                        setTimeout(() => this.start(), 15000);
                        return;
                    }
                    
                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log('🚫 Logout detectado. Limpando...');
                        cleanSession();
                        this.reconnectAttempts = 0;
                        setTimeout(() => this.start(), 10000);
                        return;
                    }
                    
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(this.reconnectAttempts * 5000, 30000);
                        console.log(`🔄 Reconectando em ${delay/1000}s...`);
                        setTimeout(() => this.start(), delay);
                    } else {
                        console.error('❌ Máximo de tentativas. Resetando...');
                        this.reconnectAttempts = 0;
                        cleanSession();
                        setTimeout(() => this.start(), 60000);
                    }
                }

                if (connection === 'open') {
                    qrCodeData = null;
                    connectionStatus = 'Conectado';
                    this.reconnectAttempts = 0;
                    console.log('✅ CONECTADO!');
                }
            });

            this.sock.ev.on('creds.update', saveCreds);
            
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const msg of messages) {
                        if (msg.key.fromMe) continue;
                        
                        try {
                            await this.sock.sendPresenceUpdate('composing', msg.key.remoteJid);
                            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                            await this.sock.sendPresenceUpdate('paused', msg.key.remoteJid);
                            
                            if (this.messageHandler) {
                                await this.messageHandler.handle(msg);
                            }
                        } catch (err) {
                            console.log(`⚠️ Erro: ${err.message}`);
                        }
                    }
                }
            });

        } catch (error) {
            console.error('💥 ERRO:', error.message);
            setTimeout(() => this.start(), 30000);
        }
    }
}

const bot = new WhatsAppBot();
bot.start();

process.on('SIGTERM', () => {
    console.log('🛑 Encerrando...');
    cleanSession();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Encerrando...');
    cleanSession();
    process.exit(0);
});
