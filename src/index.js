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
    { name: 'Samsung Galaxy S23 Ultra', os: 'Android 14', version: [2, 3000, 1015901307] },
    { name: 'Samsung Galaxy S22', os: 'Android 13', version: [2, 3000, 1015901307] },
    { name: 'Xiaomi 13 Pro', os: 'Android 13', version: [2, 3000, 1015901307] },
    { name: 'iPhone 15 Pro', os: 'iOS 17', version: [2, 3000, 1015901307] }
];

function getRandomDevice() {
    return DEVICE_CONFIGS[Math.floor(Math.random() * DEVICE_CONFIGS.length)];
}

function generateDeviceIdentity() {
    const device = getRandomDevice();
    return {
        deviceName: device.name,
        osVersion: device.os,
        browserVersion: `Chrome/${Math.floor(Math.random() * 30) + 120}.0.${Math.floor(Math.random() * 5000)}.${Math.floor(Math.random() * 100)}`,
        waVersion: device.version,
        deviceId: crypto.randomBytes(16).toString('hex')
    };
}

let connectionStatus = 'Iniciando...';
let qrCodeData = null;
let pairingCode = null;

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
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 MUNIIZ RIFAS</h1>
                    
                    ${connectionStatus === 'Erro 405' ? 
                        '<div class="error-box">⚠️ Erro de Conexão 405<br>Gerando nova identidade...</div>' : ''}
                    
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
                                ${pairingCode ? '⏳ Aguardando conexão...' : connectionStatus === 'Erro 405' ? '♻️ Reiniciando...' : '⏳ Inicializando...'}
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

const PORT = process.env.PORT
