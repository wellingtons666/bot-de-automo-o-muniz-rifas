const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
require('dotenv').config();

const app = express();
let qrCodeImage = '';
let isReady = false;
let botStatus = 'Inicializando...';
let client = null;
const logs = [];

// Configurações
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5571988140188';
const COOLDOWN_MINUTES = parseInt(process.env.COOLDOWN_MINUTES) || 30;
const cooldowns = new Map();

function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
}

function isAdmin(userId) {
    if (!userId) return false;
    const cleanNumber = userId.replace(/@c\.us|@g\.us/g, '');
    const cleanAdmin = ADMIN_NUMBER.replace(/@c\.us|@g\.us/g, '');
    return cleanNumber === cleanAdmin || cleanNumber.includes(cleanAdmin);
}

function checkCooldown(userId) {
    const lastUse = cooldowns.get(userId);
    if (!lastUse) return { canUse: true, remaining: 0 };
    const diff = Date.now() - lastUse;
    const minutesPassed = diff / (1000 * 60);
    if (minutesPassed >= COOLDOWN_MINUTES) return { canUse: true, remaining: 0 };
    return { canUse: false, remaining: Math.ceil(COOLDOWN_MINUTES - minutesPassed) };
}

// ========== SERVIDOR HTTP ==========
app.use(express.json());
app.get('/', (req, res) => {
    const recentLogs = logs.slice(-30).join('<br>');
    res.send(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Bot Muniz Rifas</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding: 20px; background: #1a1a2e; color: white; }
                    .status { padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .online { background: #28a745; }
                    .offline { background: #dc3545; }
                    .waiting { background: #ffc107; color: black; }
                    .logs { background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: left; font-family: monospace; font-size: 12px; max-height: 400px; overflow-y: auto; }
                </style>
            </head>
            <body>
                <h1>🤖 Bot Muniz Rifas</h1>
                <div class="status ${isReady ? 'online' : qrCodeImage ? 'waiting' : 'offline'}">
                    <h2>Status: ${botStatus}</h2>
                </div>
                ${qrCodeImage ? `<img src="${qrCodeImage}" style="max-width:250px;" />` : ''}
                <div class="logs">${recentLogs}</div>
            </body>
        </html>
    `);
});
app.get('/status', (req, res) => res.json({ status: botStatus, connected: isReady, admin: ADMIN_NUMBER }));
app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    log(`🌐 Servidor HTTP na porta ${PORT}`);
    setTimeout(initBot, 1000);
});

// ========== BOT ==========
function initBot() {
    try {
        log('🤖 Iniciando bot...');
        botStatus = 'Iniciando...';

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote', '--single-process'],
                timeout: 120000
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            },
            takeoverOnConflict: true
        });

        client.on('qr', async (qr) => {
            log('🔐 QR Code gerado!');
            botStatus = 'Aguardando QR...';
            try { qrCodeImage = await qrcode.toDataURL(qr); } catch (e) { log('Erro QR: ' + e.message); }
        });

        client.on('ready', () => {
            log('✅ Bot pronto!');
            isReady = true;
            botStatus = 'Online ✅';
            qrCodeImage = '';
        });

        client.on('authenticated', () => { log('🔓 Autenticado'); botStatus = 'Autenticado'; });
        client.on('auth_failure', (msg) => { log('❌ Falha auth: ' + msg); botStatus = 'Falha auth'; });
        client.on('disconnected', (reason) => {
            log('🔌 Desconectado: ' + reason);
            isReady = false; botStatus = 'Reconectando...'; qrCodeImage = '';
            setTimeout(() => client.initialize().catch(e => log('Erro reconectar: ' + e.message)), 5000);
        });

        // ========== EVENTO MESSAGE_CREATE CORRIGIDO ==========
        client.on('message_create', async (msg) => {
            
            // IGNORA mensagens do próprio bot
            if (msg.fromMe) return;
            
            // Pega o corpo da mensagem
            const body = msg.body || '';
            const command = body.toLowerCase().trim();
            
            // ========== CORREÇÃO 1: Determina o autor correto ==========
            // Em grupos: msg.author é quem enviou, msg.from é o grupo
            // Em privado: msg.from é quem enviou, msg.author é null/undefined
            let authorId = msg.author || msg.from;
            
            // Se for grupo (msg.from termina com @g.us), use msg.author
            if (msg.from && msg.from.endsWith('@g.us')) {
                authorId = msg.author; // Quem enviou no grupo
            }
            
            // Log detalhado para debug
            log(`📩 "${body.substring(0, 40)}" | De: ${msg.from} | Autor: ${authorId} | Eu: ${client.info?.wid?._serialized || 'N/A'}`);
            
            // Se não conseguir identificar autor, ignora
            if (!authorId) {
                log('⚠️ Autor não identificado, ignorando');
                return;
            }
            
            // ========== COMANDO TESTE ==========
            if (command === '!teste') {
                log('🧪 TESTE detectado de: ' + authorId);
                try {
                    await msg.reply('✅ *Bot funcionando!*\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                    log('✅ Resposta enviada');
                } catch (err) {
                    log('❌ Erro ao responder: ' + err.message);
                }
                return;
            }
            
            // ========== COMANDO MSG (MENÇÕES) ==========
            if (command === 'msg') {
                log('🎯 MSG detectado de: ' + authorId);
                
                // Verifica admin
                if (!isAdmin(authorId)) {
                    log('❌ Não é admin: ' + authorId);
                    await msg.reply('⛔ Apenas admin!\nSeu ID: ' + authorId);
                    return;
                }
                
                // Pega chat
                let chat;
                try {
                    chat = await msg.getChat();
                } catch (err) {
                    log('❌ Erro getChat: ' + err.message);
                    return;
                }
                
                // Verifica se é grupo
                if (!chat.isGroup) {
                    await msg.reply('❌ Só funciona em grupos!');
                    return;
                }
                
                log('✅ Grupo: ' + chat.name);
                
                // Verifica cooldown
                const cooldown = checkCooldown(authorId);
                if (!cooldown.canUse) {
                    await msg.reply(`⏳ Aguarde ${cooldown.remaining} minutos`);
                    return;
                }
                
                // Verifica se bot é admin
                const botId = client.info.wid._serialized;
                const botParticipant = chat.participants.find(p => p.id._serialized === botId);
                
                if (!botParticipant || !botParticipant.isAdmin) {
                    log('❌ Bot não é admin');
                    await msg.reply('⚠️ Bot precisa ser ADMIN do grupo!');
                    return;
                }
                
                log('✅ Bot é admin');
                cooldowns.set(authorId, Date.now());
                
                // Inicia menções
                await msg.reply('🚀 Iniciando...\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                
                try {
                    const participants = chat.participants;
                    const validParticipants = participants.filter(p => {
                        return p.id._serialized !== botId && !p.id._serialized.includes('broadcast');
                    });
                    
                    log(`👥 ${validParticipants.length} participantes`);
                    
                    if (validParticipants.length === 0) {
                        await msg.reply('❌ Nenhum participante válido');
                        return;
                    }
                    
                    // Lotes de 50
                    const batchSize = 50;
                    let mentioned = 0;
                    
                    for (let i = 0; i < validParticipants.length; i += batchSize) {
                        const batch = validParticipants.slice(i, i + batchSize);
                        const mentions = batch.map(p => p.id._serialized);
                        const mentionText = batch.map(p => `@${p.id.user}`).join(' ');
                        
                        try {
                            await chat.sendMessage(`🎰 *Qual bicho coloco pra você?🤑🤑*\n\n${mentionText}`, {
                                mentions: mentions,
                                sendSeen: false
                            });
                            mentioned += batch.length;
                            log(`✅ Lote: ${mentioned}/${validParticipants.length}`);
                            
                            if (i + batchSize < validParticipants.length) {
                                await new Promise(r => setTimeout(r, 5000));
                            }
                        } catch (err) {
                            log('❌ Erro lote: ' + err.message);
                        }
                    }
                    
                    await msg.reply(`✅ Concluído! ${mentioned} membros\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                    log('✅ Menções concluídas');
                    
                } catch (err) {
                    log('❌ Erro: ' + err.message);
                    await msg.reply('❌ Erro: ' + err.message);
                }
            }
            
            // ========== AJUDA ==========
            if (command === '!ajuda') {
                await msg.reply(`🤖 *Comandos:*\n• \`msg\` - Menciona todos (admin)\n• \`!teste\` - Testa bot\n\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
            }
        });

        client.initialize().catch(err => {
            log('❌ Erro init: ' + err.message);
            botStatus = 'Erro';
        });

    } catch (error) {
        log('❌ Erro fatal: ' + error.message);
        botStatus = 'Erro fatal';
    }
}

process.on('SIGTERM', () => {
    log('SIGTERM recebido');
    server.close(() => {
        if (client) client.destroy();
        process.exit(0);
    });
});
