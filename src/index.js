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

// Configurações - MÚLTIPLOS ADMINS
const ADMIN_NUMBERS = [
    process.env.ADMIN_NUMBER || '5571988140188',
    '557199465875'  // Novo admin adicionado
];
const COOLDOWN_MINUTES = parseInt(process.env.COOLDOWN_MINUTES) || 30;
const cooldowns = new Map();

function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
}

// CORREÇÃO: Função isAdmin atualizada para múltiplos admins
function isAdmin(userId) {
    if (!userId) {
        log('⚠️ isAdmin: userId é null/undefined');
        return false;
    }
    
    const cleanNumber = userId.replace(/@c\.us|@g\.us|@lid/g, '').replace(/\D/g, '');
    log(`🔍 Verificando admin: ${cleanNumber}`);
    
    for (const admin of ADMIN_NUMBERS) {
        const cleanAdmin = admin.replace(/@c\.us|@g\.us|@lid/g, '').replace(/\D/g, '');
        log(`  Comparando com: ${cleanAdmin}`);
        
        if (cleanNumber === cleanAdmin || cleanNumber.includes(cleanAdmin) || cleanAdmin.includes(cleanNumber)) {
            log(`  ✅ É ADMIN!`);
            return true;
        }
    }
    
    log(`  ❌ Não é admin`);
    return false;
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
    const recentLogs = logs.slice(-50).join('<br>');
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
                    .logs { background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; text-align: left; font-family: monospace; font-size: 12px; max-height: 500px; overflow-y: auto; white-space: pre-wrap; }
                    .admin-list { background: rgba(255,255,255,0.1); padding: 10px; border-radius: 5px; margin: 10px 0; }
                </style>
            </head>
            <body>
                <h1>🤖 Bot Muniz Rifas</h1>
                <div class="status ${isReady ? 'online' : qrCodeImage ? 'waiting' : 'offline'}">
                    <h2>Status: ${botStatus}</h2>
                </div>
                <div class="admin-list">
                    <strong>Admins:</strong> ${ADMIN_NUMBERS.join(', ')}
                </div>
                ${qrCodeImage ? `<img src="${qrCodeImage}" style="max-width:250px;" />` : ''}
                <div class="logs">${recentLogs}</div>
            </body>
        </html>
    `);
});
app.get('/status', (req, res) => res.json({ status: botStatus, connected: isReady, admins: ADMIN_NUMBERS }));
app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    log(`🌐 Servidor HTTP na porta ${PORT}`);
    log(`👥 Admins configurados: ${ADMIN_NUMBERS.join(', ')}`);
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

        // CORREÇÃO: Usar 'message' em vez de 'message_create' para capturar todas as mensagens
        client.on('message', async (msg) => {
            // Ignora mensagens do próprio bot
            if (msg.fromMe) return;
            
            const body = msg.body || '';
            const command = body.toLowerCase().trim();
            
            // CORREÇÃO: Identificar corretamente o autor
            let authorId = msg.author || msg.from;
            const chat = await msg.getChat();
            const isGroup = chat.isGroup;
            
            // Se for grupo, msg.author é quem enviou, msg.from é o grupo
            // Se for privado, msg.from é quem enviou (e msg.author é undefined ou igual)
            if (isGroup) {
                authorId = msg.author; // No grupo, author é o usuário real
            } else {
                authorId = msg.from; // No privado, from é o usuário
            }
            
            // LOG DETALHADO PARA DEBUG
            log(`\n📩 ====================`);
            log(`💬 Mensagem: "${body.substring(0, 50)}"`);
            log(`👤 De (from): ${msg.from}`);
            log(`✍️ Autor (author): ${msg.author}`);
            log(`🎯 AuthorId usado: ${authorId}`);
            log(`👥 É grupo: ${isGroup}`);
            log(`🏷️ Nome do chat: ${chat.name || 'Privado'}`);
            log(`🔑 Comando: "${command}"`);
            
            if (!authorId) {
                log('⚠️ ERRO: AuthorId não identificado!');
                return;
            }
            
            // ========== COMANDO TESTE ==========
            if (command === '!teste' || command === 'teste') {
                log('🧪 TESTE detectado de: ' + authorId);
                try {
                    await msg.reply('✅ *Bot funcionando!*\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                    log('✅ Resposta de teste enviada');
                } catch (err) {
                    log('❌ Erro teste: ' + err.message);
                }
                return;
            }
            
            // ========== COMANDO ID (para descobrir seu ID) ==========
            if (command === '!id' || command === 'meuid' || command === 'id') {
                log('🆔 Comando ID de: ' + authorId);
                await msg.reply(`🆔 *Seu ID:*\n\`${authorId}\`\n\n📱 Número: ${authorId.replace(/@c\.us|@g\.us|@lid/g, '')}`);
                return;
            }
            
            // ========== COMANDO MSG (MENÇÕES FORÇADAS) ==========
            if (command === 'msg') {
                log('🎯 MSG detectado de: ' + authorId);
                
                if (!isAdmin(authorId)) {
                    log('❌ Não é admin: ' + authorId);
                    await msg.reply('⛔ *Acesso negado!*\nSeu ID: `' + authorId + '`\nVocê não está na lista de admins.');
                    return;
                }
                
                if (!isGroup) {
                    await msg.reply('❌ Só funciona em grupos!');
                    return;
                }
                
                const cooldown = checkCooldown(authorId);
                if (!cooldown.canUse) {
                    await msg.reply(`⏳ Aguarde ${cooldown.remaining} minutos`);
                    return;
                }
                
                const botId = client.info.wid._serialized;
                const botParticipant = chat.participants.find(p => p.id._serialized === botId);
                
                if (!botParticipant || !botParticipant.isAdmin) {
                    log('❌ Bot não é admin neste grupo');
                    await msg.reply('⚠️ Bot precisa ser ADMIN do grupo!');
                    return;
                }
                
                log('✅ Bot é admin, prosseguindo...');
                cooldowns.set(authorId, Date.now());
                
                await chat.sendMessage('🚀 *Iniciando menções FORÇADAS...*\n🔔 Todos serão notificados!\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                
                try {
                    const participants = chat.participants;
                    const validParticipants = participants.filter(p => {
                        return p.id._serialized !== botId && !p.id._serialized.includes('broadcast');
                    });
                    
                    log(`👥 Total de participantes: ${participants.length}`);
                    log(`👥 Válidos para menção: ${validParticipants.length}`);
                    
                    if (validParticipants.length === 0) {
                        await chat.sendMessage('❌ Nenhum participante válido');
                        return;
                    }
                    
                    const batchSize = 50;
                    let mentioned = 0;
                    
                    for (let i = 0; i < validParticipants.length; i += batchSize) {
                        const batch = validParticipants.slice(i, i + batchSize);
                        const mentions = batch.map(p => p.id._serialized);
                        const mentionText = batch.map(p => `@${p.id.user}`).join(' ');
                        
                        const messageText = `🔔🔔🔔 *ATENÇÃO RIFAS MUNIZ* 🔔🔔🔔\n\n🎰 *Qual bicho coloco pra você?🤑🤑*\n\n${mentionText}\n\n⚠️ *Você foi mencionado!*`;
                        
                        try {
                            log(`📤 Enviando lote ${Math.floor(i/batchSize) + 1}: ${batch.length} menções`);
                            
                            await chat.sendMessage(messageText, {
                                mentions: mentions,
                                sendSeen: false,
                                linkPreview: false
                            });
                            
                            mentioned += batch.length;
                            log(`✅ Lote enviado: ${mentioned}/${validParticipants.length}`);
                            
                            if (i + batchSize < validParticipants.length) {
                                await new Promise(r => setTimeout(r, 3000));
                            }
                            
                        } catch (err) {
                            log(`❌ Erro no lote: ${err.message}`);
                        }
                    }
                    
                    await chat.sendMessage(`✅ *Notificação concluída!*\n📊 ${mentioned} membros alertados\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                    log('✅ MSG concluído com sucesso');
                    
                } catch (err) {
                    log('❌ Erro fatal em msg: ' + err.message);
                    await chat.sendMessage('❌ Erro: ' + err.message);
                }
                return;
            }
            
            // ========== COMANDO MSG2 (MODO AGRESSIVO) ==========
            if (command === 'msg2') {
                log('💥 MSG2 detectado de: ' + authorId);
                
                if (!isAdmin(authorId)) {
                    log('❌ Não é admin: ' + authorId);
                    await msg.reply('⛔ *Acesso negado!*\nSeu ID: `' + authorId + '`\nVocê não está na lista de admins.');
                    return;
                }
                
                if (!isGroup) {
                    await msg.reply('❌ Só em grupos!');
                    return;
                }
                
                const cooldown = checkCooldown(authorId);
                if (!cooldown.canUse) {
                    await msg.reply(`⏳ Aguarde ${cooldown.remaining} minutos`);
                    return;
                }
                
                const botId = client.info.wid._serialized;
                const botParticipant = chat.participants.find(p => p.id._serialized === botId);
                
                if (!botParticipant || !botParticipant.isAdmin) {
                    await msg.reply('⚠️ Bot precisa ser ADMIN!');
                    return;
                }
                
                cooldowns.set(authorId, Date.now());
                
                await chat.sendMessage('💥 *MODO AGRESSIVO ATIVADO* 💥\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                
                try {
                    const participants = chat.participants.filter(p => 
                        p.id._serialized !== botId && !p.id._serialized.includes('broadcast')
                    );
                    
                    const miniBatch = 5;
                    let count = 0;
                    
                    for (let i = 0; i < participants.length; i += miniBatch) {
                        const batch = participants.slice(i, i + miniBatch);
                        const mentions = batch.map(p => p.id._serialized);
                        const text = batch.map(p => `@${p.id.user}`).join(' ');
                        
                        await chat.sendMessage(`🔔 ${text}\n🎰 *Qual bicho coloco pra você?🤑🤑*`, { mentions });
                        count += batch.length;
                        
                        if (i + miniBatch < participants.length) {
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }
                    
                    await chat.sendMessage(`✅ *MODO AGRESSIVO CONCLUÍDO!*\n📊 ${count} notificações enviadas\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                    log('✅ MSG2 concluído');
                    
                } catch (err) {
                    log('❌ Erro msg2: ' + err.message);
                }
                return;
            }
            
            // ========== AJUDA ==========
            if (command === '!ajuda' || command === 'ajuda') {
                log('❓ AJUDA solicitada por: ' + authorId);
                await msg.reply(`🤖 *Bot Muniz Rifas*

📌 *Comandos disponíveis:*

• \`msg\` - Menciona todos (modo normal) *Admin only*
• \`msg2\` - Menciona todos (modo agressivo) *Admin only*
• \`!teste\` ou \`teste\` - Testa se bot está online
• \`!id\` ou \`id\` - Mostra seu ID de usuário
• \`!ajuda\` - Mostra esta mensagem

👑 *Seu status:* ${isAdmin(authorId) ? '✅ ADMIN' : '❌ Usuário comum'}
🆔 *Seu ID:* \`${authorId}\`

🎰 *Qual bicho coloco pra você?🤑🤑*`);
                return;
            }
            
            // Se chegou aqui, não era comando conhecido
            log(`❓ Não é comando: "${command}"`);
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
