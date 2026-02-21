const crypto = require('crypto');
global.crypto = crypto;

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const http = require('http');
const QRCode = require('qrcode');

// Configurações globais
let currentQR = null;
let connectionStatus = 'Desconectado';
let qrCodeData = null;
let pairingCode = null;

// === CONFIGURAÇÃO DE EVASÃO ===
const DEVICE_CONFIGS = [
    { name: 'Samsung Galaxy S23', os: 'Android 13', version: [2, 24, 6] },
    { name: 'Samsung Galaxy S22', os: 'Android 12', version: [2, 23, 14] },
    { name: 'Xiaomi 13 Pro', os: 'Android 13', version: [2, 24, 6] },
    { name: 'iPhone 14 Pro', os: 'iOS 16', version: [2, 23, 12] }
];

function getRandomDevice() {
    return DEVICE_CONFIGS[Math.floor(Math.random() * DEVICE_CONFIGS.length)];
}

function generateBrowserFingerprint() {
    const device = getRandomDevice();
    const chromeVersion = Math.floor(Math.random() * 30) + 110; // 110-140
    
    return {
        deviceName: device.name,
        osVersion: device.os,
        browserVersion: `Chrome/${chromeVersion}.0.${Math.floor(Math.random() * 5000)}.${Math.floor(Math.random() * 100)}`,
        waVersion: device.version,
        deviceId: crypto.randomBytes(16).toString('hex')
    };
}

// Limpa sessão de forma agressiva
function cleanSession() {
    const authPath = path.join(process.cwd(), 'auth_info');
    const sessionPaths = [
        authPath,
        path.join(process.cwd(), 'baileys_auth'),
        path.join(process.cwd(), 'session'),
        '/tmp/puppeteer_dev_chrome_profile-*'
    ];
    
    sessionPaths.forEach(p => {
        try {
            if (fs.existsSync(p)) {
                fs.rmSync(p, { recursive: true, force: true });
                console.log(`🧹 Limpado: ${p}`);
            }
        } catch (e) {
            // ignora erros
        }
    });
    
    // Recria diretório limpo
    fs.mkdirSync(authPath, { recursive: true });
    return authPath;
}

// Servidor web
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.url === '/') {
        res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bot WhatsApp - MUNIIZ RIFAS</title>
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
                    .pairing-code {
                        background: #00d26a;
                        color: white;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px 0;
                        font-size: 36px;
                        font-weight: bold;
                        letter-spacing: 8px;
                        animation: glow 2s ease-in-out infinite alternate;
                    }
                    @keyframes glow {
                        from { box-shadow: 0 0 10px #00d26a; }
                        to { box-shadow: 0 0 20px #00d26a, 0 0 30px #00d26a; }
                    }
                    .info { margin-top: 20px; color: #f0f0f0; font-size: 14px; line-height: 1.8; }
                    .loading { font-size: 18px; color: #666; padding: 30px; }
                    .warning { background: #ffa502; color: #333; padding: 15px; border-radius: 10px; margin-bottom: 20px; font-weight: bold; }
                    .error-box { background: #ff4757; color: white; padding: 15px; border-radius: 10px; margin: 20px 0; }
                    .device-info { background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; margin: 10px 0; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 MUNIIZ RIFAS - WhatsApp Bot</h1>
                    
                    ${connectionStatus === 'Erro 405' ? 
                        '<div class="error-box">⚠️ Erro de Conexão 405<br>Tentando nova identidade...</div>' : ''}
                    
                    ${!qrCodeData && !pairingCode && connectionStatus !== 'Conectado' && connectionStatus !== 'Erro 405' ? 
                        '<div class="warning">⚡ Inicializando...</div>' : ''}
                    
                    <div class="status ${connectionStatus === 'Conectado' ? 'conectado' : connectionStatus === 'Aguardando QR' ? 'aguardando' : connectionStatus === 'Erro 405' ? 'erro' : 'desconectado'}">
                        ${connectionStatus}
                    </div>

                    ${pairingCode ? `
                        <div style="margin: 20px 0;">
                            <p style="font-size: 18px; margin-bottom: 10px;">📱 Código de Pareamento:</p>
                            <div class="pairing-code">${pairingCode}</div>
                            <p style="font-size: 12px; margin-top: 10px;">WhatsApp → Configurações → Dispositivos → Link com código</p>
                        </div>
                    ` : ''}

                    <div id="qrcode">
                        ${qrCodeData ? 
                            `<img src="${qrCodeData}" alt="QR Code">` : 
                            `<div class="loading">
                                ${pairingCode ? '⏳ Aguardando conexão...' : connectionStatus === 'Erro 405' ? '♻️ Reiniciando...' : '⏳ Gerando QR...'}
                            </div>`
                        }
                    </div>

                    <div class="info">
                        <p><strong>📱 Como conectar:</strong></p>
                        <p>1. Abra WhatsApp no celular</p>
                        <p>2. Configurações → Dispositivos Conectados</p>
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
    console.log(`🌐 Servidor web: http://0.0.0.0:${PORT}`);
});

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.messageHandler = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.deviceIdentity = generateBrowserFingerprint();
        this.authPath = cleanSession();
    }

    async start() {
        try {
            // Limpa sessão a cada tentativa para evitar lock
            if (this.reconnectAttempts > 0) {
                console.log('🧹 Limpando sessão anterior...');
                this.authPath = cleanSession();
                // Gera nova identidade a cada erro 405
                this.deviceIdentity = generateBrowserFingerprint();
                await new Promise(r => setTimeout(r, 5000));
            }

            console.log(`🤖 Iniciando MUNIIZ RIFAS Bot...`);
            console.log(`📱 Dispositivo: ${this.deviceIdentity.deviceName}`);
            console.log(`🆔 ID: ${this.deviceIdentity.deviceId.substring(0, 8)}...`);

            // Busca versão mais recente do WhatsApp Web
            let version = this.deviceIdentity.waVersion;
            try {
                const { version: latestVersion } = await fetchLatestBaileysVersion();
                version = latestVersion || version;
                console.log(`📦 Versão WA: ${version.join('.')}`);
            } catch (e) {
                console.log(`📦 Usando versão fallback: ${version.join('.')}`);
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

            // Configuração "stealth" avançada
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: { 
                    level: 'silent',
                    trace: () => {},
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    fatal: () => {}
                },
                
                // Identidade móvel realista
                browser: [this.deviceIdentity.deviceName, this.deviceIdentity.osVersion, this.deviceIdentity.browserVersion],
                
                // Versão do protocolo
                version: version,
                
                // Timeouts
                connectTimeoutMs: 120000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                
                // Comportamento humano
                markOnlineOnConnect: false,
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                
                // Configurações avançadas
                emitOwnEvents: true,
                fireInitQueries: true,
                downloadHistory: false,
                
                // Patch de mensagens
                patchMessageBeforeSending: (msg) => {
                    // Adiciona delay aleatório para parecer humano
                    return new Promise(resolve => {
                        setTimeout(() => resolve(msg), Math.random() * 1000);
                    });
                },
                
                getMessage: async () => undefined,
                
                // Opções extras de conexão
                retryRequestDelayMs: 5000,
                maxMsgRetryCount: 5,
                msgRetryCounterMap: new Map(),
                
                // Ignora algumas verificações
                ignoreBroadcast: true,
                ignoreGroupMessages: false,
            });

            // Tenta código de pareamento primeiro
            if (!state.creds.registered && !state.creds.me) {
                console.log('📱 Solicitando código de pareamento...');
                try {
                    await new Promise(r => setTimeout(r, 5000));
                    
                    const phoneNumber = '5571988140188'; // Seu número
                    const code = await this.sock.requestPairingCode(phoneNumber);
                    
                    if (code) {
                        pairingCode = code;
                        connectionStatus = 'Aguardando QR';
                        console.log(`🔢 Código gerado: ${code}`);
                    }
                } catch (err) {
                    console.log('⚠️ Código falhou, aguardando QR Code...');
                    pairingCode = null;
                }
            }

            // Handler de conexão
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !pairingCode) {
                    try {
                        qrCodeData = await QRCode.toDataURL(qr);
                        currentQR = qr;
                        connectionStatus = 'Aguardando QR';
                        console.log('📱 QR Code gerado!');
                        qrcode.generate(qr, { small: true });
                    } catch (err) {
                        console.error('Erro ao gerar QR:', err.message);
                    }
                }

                if (connection === 'close') {
                    currentQR = null;
                    qrCodeData = null;
                    pairingCode = null;
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.message;
                    
                    console.log(`❌ Conexão fechada. Status: ${statusCode}, Razão: ${reason}`);
                    
                    // Erro 405 - Muda identidade completamente
                    if (statusCode === 405 || statusCode === DisconnectReason.connectionLost) {
                        connectionStatus = 'Erro 405';
                        console.log('🔄 Erro 405 detectado! Gerando nova identidade...');
                        
                        // Limpa tudo
                        cleanSession();
                        this.deviceIdentity = generateBrowserFingerprint();
                        this.reconnectAttempts++;
                        
                        const delay = Math.min(this.reconnectAttempts * 10000, 60000);
                        console.log(`⏳ Aguardando ${delay/1000}s antes de reconectar...`);
                        
                        setTimeout(() => this.start(), delay);
                        return;
                    }
                    
                    // Logout ou ban
                    if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.forbidden) {
                        console.log('🚫 Sessão encerrada ou banida. Limpando...');
                        cleanSession();
                        this.reconnectAttempts = 0;
                        setTimeout(() => this.start(), 30000);
                        return;
                    }
                    
                    // Outros erros
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(this.reconnectAttempts * 5000, 30000);
                        console.log(`🔄 Reconectando em ${delay/1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                        setTimeout(() => this.start(), delay);
                    } else {
                        console.error('❌ Máximo de tentativas atingido. Resetando...');
                        this.reconnectAttempts = 0;
                        cleanSession();
                        setTimeout(() => this.start(), 120000);
                    }
                }

                if (connection === 'open') {
                    currentQR = null;
                    qrCodeData = null;
                    pairingCode = null;
                    connectionStatus = 'Conectado';
                    this.reconnectAttempts = 0;
                    console.log('✅ CONECTADO COM SUCESSO!');
                    console.log(`📱 Usuário: ${this.sock.user?.id || 'N/A'}`);
                }
            });

            this.sock.ev.on('creds.update', saveCreds);
            
            // Handler de mensagens
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const msg of messages) {
                        try {
                            // Ignora mensagens do próprio bot
                            if (msg.key.fromMe) continue;
                            
                            // Simula digitação para parecer humano
                            await this.sock.sendPresenceUpdate('composing', msg.key.remoteJid);
                            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                            await this.sock.sendPresenceUpdate('paused', msg.key.remoteJid);
                            
                            // Processa mensagem
                            if (this.messageHandler) {
                                await this.messageHandler.handle(msg);
                            }
                        } catch (err) {
                            console.error('Erro ao processar mensagem:', err.message);
                        }
                    }
                }
            });

        } catch (error) {
            console.error('💥 Erro fatal:', error.message);
            connectionStatus = 'Erro';
            setTimeout(() => this.start(), 30000);
        }
    }
}

// Inicia o bot
const bot = new WhatsAppBot();
bot.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM recebido, limpando...');
    cleanSession();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT recebido, limpando...');
    cleanSession();
    process.exit(0);
});
