const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
let qrCodeImage = '';
let isReady = false;
let botStatus = 'Inicializando...';
let client = null;

// ========== SERVIDOR HTTP (INICIA PRIMEIRO) ==========
app.use(express.json());

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Bot Muniz Rifas</title>
                <meta http-equiv="refresh" content="10">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #1a1a1a; color: white; }
                    .status { padding: 20px; border-radius: 10px; margin: 20px; }
                    .online { background: #28a745; }
                    .offline { background: #dc3545; }
                    .waiting { background: #ffc107; color: black; }
                    img { max-width: 300px; margin: 20px; }
                    .logs { background: #333; padding: 15px; border-radius: 5px; text-align: left; max-width: 800px; margin: 20px auto; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; }
                </style>
            </head>
            <body>
                <h1>🤖 Bot Muniz Rifas</h1>
                <div class="status ${isReady ? 'online' : qrCodeImage ? 'waiting' : 'offline'}">
                    <h2>Status: ${botStatus}</h2>
                    ${isReady ? '<p>Bot está funcionando normalmente!</p>' : ''}
                </div>
                ${qrCodeImage ? `<h3>Escaneie o QR Code:</h3><img src="${qrCodeImage}" />` : ''}
                <div class="logs">
                    <strong>Logs:</strong><br>
                    ${logs.join('<br>')}
                </div>
                <p>Última atualização: ${new Date().toLocaleString()}</p>
            </body>
        </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        status: botStatus,
        connected: isReady,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const logs = [];
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logs.push(logMessage);
    if (logs.length > 50) logs.shift();
}

const PORT = process.env.PORT || 3000;

// INICIA SERVIDOR IMEDIATAMENTE
const server = app.listen(PORT, '0.0.0.0', () => {
    log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
    log(`🔗 URL: https://bot-de-automo-o-muniz-rifas-production.up.railway.app/`);
    
    // Inicia o bot DEPOIS que o servidor estiver no ar
    setTimeout(initBot, 2000);
});

// ========== CONFIGURAÇÃO DO WHATSAPP ==========
function initBot() {
    try {
        log('🤖 Iniciando bot WhatsApp...');
        botStatus = 'Iniciando Puppeteer...';

        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-background-networking'
                ],
                timeout: 60000 // 60 segundos
            }
        });

        // Eventos
        client.on('qr', async (qr) => {
            log('🔐 QR Code gerado! Escaneie no WhatsApp...');
            botStatus = 'Aguardando QR Code...';
            
            try {
                qrCodeImage = await qrcode.toDataURL(qr);
            } catch (err) {
                log('Erro ao gerar QR: ' + err.message);
            }
        });

        client.on('ready', () => {
            log('✅ Bot conectado e pronto!');
            isReady = true;
            botStatus = 'Bot Online ✅';
            qrCodeImage = '';
        });

        client.on('authenticated', () => {
            log('🔓 Autenticado!');
            botStatus = 'Autenticado...';
        });

        client.on('auth_failure', (msg) => {
            log('❌ Falha na autenticação: ' + msg);
            botStatus = 'Falha na autenticação';
        });

        client.on('disconnected', (reason) => {
            log('🔌 Bot desconectado: ' + reason);
            isReady = false;
            botStatus = 'Desconectado - Reconectando...';
            qrCodeImage = '';
            
            // Tenta reconectar
            setTimeout(() => {
                client.initialize().catch(err => {
                    log('Erro ao reconectar: ' + err.message);
                });
            }, 5000);
        });

        // Comandos
        setupCommands();

        // Inicializa
        client.initialize().catch(err => {
            log('❌ Erro ao inicializar cliente: ' + err.message);
            botStatus = 'Erro na inicialização';
        });

    } catch (error) {
        log('❌ Erro fatal ao iniciar bot: ' + error.message);
        botStatus = 'Erro fatal';
    }
}

// ========== COMANDOS ==========
function setupCommands() {
    const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5571988140188';
    const cooldowns = new Map();
    
    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;
        
        const command = msg.body.toLowerCase().trim();
        const userId = msg.author || msg.from;
        
        if (command === 'uau') {
            // Verifica admin
            if (!userId.includes(ADMIN_NUMBER)) {
                await msg.reply('⛔ Apenas administradores podem usar este comando.');
                return;
            }
            
            // Cooldown
            const lastUse = cooldowns.get(userId);
            if (lastUse && (Date.now() - lastUse) < 30 * 60 * 1000) {
                const remaining = Math.ceil((30 * 60 * 1000 - (Date.now() - lastUse)) / 60000);
                await msg.reply(`⏳ Aguarde ${remaining} minutos.`);
                return;
            }
            
            cooldowns.set(userId, Date.now());
            
            try {
                const chat = await msg.getChat();
                if (!chat.isGroup) {
                    await msg.reply('❌ Este comando só funciona em grupos!');
                    return;
                }
                
                await msg.reply('🚀 Iniciando menções...');
                log(`Menções iniciadas por ${userId}`);
                
                const participants = chat.participants;
                const batchSize = 50;
                let count = 0;
                
                for (let i = 0; i < participants.length; i += batchSize) {
                    const batch = participants.slice(i, i + batchSize);
                    const mentions = batch.map(p => p.id._serialized);
                    
                    await chat.sendMessage(
                        `🔔 ${batch.map(p => `@${p.id.user}`).join(' ')}`, 
                        { mentions }
                    );
                    count += batch.length;
                    
                    if (i + batchSize < participants.length) {
                        await new Promise(r => setTimeout(r, 10000));
                    }
                }
                
                await msg.reply(`✅ ${count} membros mencionados!`);
                log(`Menções concluídas: ${count}`);
                
            } catch (err) {
                log('Erro no comando uau: ' + err.message);
                await msg.reply('❌ Erro ao executar comando.');
            }
        }
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    log('SIGTERM recebido, encerrando...');
    server.close(() => {
        if (client) client.destroy();
        process.exit(0);
    });
});
