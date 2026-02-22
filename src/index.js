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

// Configuração do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection'
        ]
    }
});

// Eventos do WhatsApp
client.on('qr', async (qr) => {
    console.log('🔐 QR Code gerado! Escaneie no WhatsApp...');
    botStatus = 'Aguardando QR Code...';
    
    try {
        qrCodeImage = await qrcode.toDataURL(qr);
    } catch (err) {
        console.error('Erro ao gerar QR:', err);
    }
});

client.on('ready', () => {
    console.log('✅ Bot conectado e pronto!');
    isReady = true;
    botStatus = 'Bot Online ✅';
    qrCodeImage = ''; // Limpa QR após conexão
});

client.on('authenticated', () => {
    console.log('🔓 Autenticado!');
    botStatus = 'Autenticado...';
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    botStatus = 'Falha na autenticação';
});

client.on('disconnected', (reason) => {
    console.log('🔌 Bot desconectado:', reason);
    isReady = false;
    botStatus = 'Desconectado';
    // Reconecta automaticamente
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// Sistema anti-spam e comandos
const cooldowns = new Map();
const mentionCounts = new Map();
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5571988140188';
const COOLDOWN_MINUTES = parseInt(process.env.COOLDOWN_MINUTES) || 30;
const MENTION_LIMIT = parseInt(process.env.MENTION_LIMIT) || 3;

function isAdmin(number) {
    return number.includes(ADMIN_NUMBER);
}

function checkCooldown(userId) {
    const lastUse = cooldowns.get(userId);
    if (!lastUse) return true;
    
    const diff = Date.now() - lastUse;
    const minutes = diff / (1000 * 60);
    return minutes >= COOLDOWN_MINUTES;
}

function getRemainingCooldown(userId) {
    const lastUse = cooldowns.get(userId);
    if (!lastUse) return 0;
    
    const diff = Date.now() - lastUse;
    const minutes = diff / (1000 * 60);
    return Math.ceil(COOLDOWN_MINUTES - minutes);
}

// Handler de mensagens
client.on('message_create', async (msg) => {
    // Ignora mensagens do próprio bot
    if (msg.fromMe) return;
    
    const command = msg.body.toLowerCase().trim();
    const userId = msg.author || msg.from;
    
    // Comando UAU - Ativa menções
    if (command === 'uau') {
        // Verifica se é admin
        if (!isAdmin(userId)) {
            await msg.reply('⛔ Apenas administradores podem usar este comando.');
            return;
        }
        
        // Verifica cooldown
        if (!checkCooldown(userId)) {
            const remaining = getRemainingCooldown(userId);
            await msg.reply(`⏳ Aguarde ${remaining} minutos para usar o comando novamente.`);
            return;
        }
        
        // Registra uso
        cooldowns.set(userId, Date.now());
        
        // Obtém membros do grupo
        const chat = await msg.getChat();
        if (!chat.isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos!');
            return;
        }
        
        await msg.reply('🚀 Iniciando menções automáticas...');
        
        // Sistema de menções em lotes
        const participants = chat.participants;
        const batchSize = parseInt(process.env.BATCH_SIZE) || 50;
        const delaySeconds = parseInt(process.env.DELAY_SECONDS) || 10;
        let mentionCount = 0;
        
        for (let i = 0; i < participants.length; i += batchSize) {
            const batch = participants.slice(i, i + batchSize);
            const mentions = batch.map(p => p.id._serialized);
            
            try {
                await chat.sendMessage(`🔔 ${batch.map(p => `@${p.id.user}`).join(' ')}`, { mentions });
                mentionCount += batch.length;
                
                if (i + batchSize < participants.length) {
                    await new Promise(r => setTimeout(r, delaySeconds * 1000));
                }
            } catch (err) {
                console.error('Erro ao mencionar:', err);
            }
        }
        
        await msg.reply(`✅ Menções concluídas! Total: ${mentionCount} membros.`);
    }
});

// Rotas HTTP para monitoramento
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
                </style>
            </head>
            <body>
                <h1>🤖 Bot Muniz Rifas</h1>
                <div class="status ${isReady ? 'online' : qrCodeImage ? 'waiting' : 'offline'}">
                    <h2>Status: ${botStatus}</h2>
                    ${isReady ? '<p>Bot está funcionando normalmente!</p>' : ''}
                </div>
                ${qrCodeImage ? `<h3>Escaneie o QR Code:</h3><img src="${qrCodeImage}" />` : ''}
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

// Health check para Railway
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;

// Inicia servidor HTTP primeiro
app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Acesse: https://seu-app.railway.app/`);
    
    // Depois inicia o bot
    console.log('🤖 Iniciando bot WhatsApp...');
    client.initialize().catch(err => {
        console.error('Erro ao inicializar bot:', err);
    });
});
