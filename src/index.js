const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

// Configurações
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5571988140188';
const CLIENT_ID = process.env.CLIENT_ID || 'muniz-rifas-bot';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ ERRO: MONGODB_URI não definida!');
    console.error('Adicione a variável MONGODB_URI no Railway Dashboard');
    process.exit(1);
}

// Estado do bot
let isReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Conectar ao MongoDB e iniciar bot
async function startBot() {
    try {
        console.log('🔄 Conectando ao MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB conectado!');

        const store = new MongoStore({ mongoose: mongoose });
        
        const client = new Client({
            authStrategy: new RemoteAuth({
                store: store,
                backupSyncIntervalMs: 300000, // Backup a cada 5 min
                clientId: CLIENT_ID
            }),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-extensions'
                ],
                ignoreDefaultArgs: ['--disable-extensions']
            },
            qrMaxRetries: 5,
            authTimeoutMs: 60000,
            takeoverOnConflict: true,
            restartOnAuthFail: true
        });

        // Evento: QR Code
        client.on('qr', (qr) => {
            console.log('📱 Escaneie o QR Code:');
            qrcode.generate(qr, { small: true });
            
            // Salvar em arquivo para acesso via logs
            const fs = require('fs');
            fs.writeFileSync('./last-qr.txt', qr);
            console.log('📝 QR Code também salvo em last-qr.txt');
        });

        // Evento: Autenticado
        client.on('authenticated', () => {
            console.log('🔐 Bot autenticado!');
            reconnectAttempts = 0;
        });

        // Evento: Sessão remota salva
        client.on('remote_session_saved', () => {
            console.log('💾 Sessão salva no MongoDB!');
        });

        // Evento: Falha na autenticação
        client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
        });

        // Evento: Pronto
        client.on('ready', () => {
            console.log('✅ Bot está pronto!');
            isReady = true;
            reconnectAttempts = 0;
        });

        // Evento: Desconectado com reconexão
        client.on('disconnected', (reason) => {
            console.warn('⚠️ Desconectado:', reason);
            isReady = false;
            
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔄 Reconectando... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                
                setTimeout(() => {
                    client.initialize().catch(err => {
                        console.error('Erro ao reconectar:', err);
                    });
                }, 5000 * reconnectAttempts);
            } else {
                console.error('❌ Máximo de tentativas atingido. Reiniciando...');
                process.exit(1); // Railway vai reiniciar o container
            }
        });

        // Sistema anti-spam
        const cooldowns = new Map();
        const mentionLimits = new Map();
        const COOLDOWN_TIME = 30 * 60 * 1000;
        const MAX_MENTIONS_PER_HOUR = 3;
        const BATCH_SIZE = 50;
        const BATCH_DELAY = 10000;

        function isAdmin(number) {
            return number.replace(/\D/g, '') === ADMIN_NUMBER.replace(/\D/g, '');
        }

        function checkCooldown(userId) {
            const now = Date.now();
            if (cooldowns.has(userId)) {
                const expiration = cooldowns.get(userId);
                if (now < expiration) {
                    return Math.ceil((expiration - now) / 1000 / 60);
                }
            }
            return 0;
        }

        function checkMentionLimit(userId) {
            const now = Date.now();
            if (!mentionLimits.has(userId)) {
                mentionLimits.set(userId, { count: 0, resetTime: now + 60 * 60 * 1000 });
                return true;
            }
            
            const limit = mentionLimits.get(userId);
            if (now > limit.resetTime) {
                mentionLimits.set(userId, { count: 1, resetTime: now + 60 * 60 * 1000 });
                return true;
            }
            
            if (limit.count >= MAX_MENTIONS_PER_HOUR) return false;
            limit.count++;
            return true;
        }

        async function mentionAll(chat, text = '') {
            try {
                const participants = await chat.participants;
                const mentions = [];
                const ids = [];
                
                for (const participant of participants) {
                    mentions.push(participant.id._serialized);
                    ids.push(participant.id._serialized);
                }
                
                for (let i = 0; i < mentions.length; i += BATCH_SIZE) {
                    const batch = ids.slice(i, i + BATCH_SIZE);
                    
                    await chat.sendMessage(text || '🔔 Notificação!', {
                        mentions: batch
                    });
                    
                    if (i + BATCH_SIZE < mentions.length) {
                        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                    }
                }
                return true;
            } catch (error) {
                console.error('Erro ao mencionar:', error);
                return false;
            }
        }

        // Handler de mensagens
        client.on('message_create', async (msg) => {
            if (!msg.fromMe && !isReady) return;
            
            const chat = await msg.getChat();
            
            if (msg.body.toLowerCase() === 'uau') {
                const sender = await msg.getContact();
                const senderNumber = sender.number;
                
                if (!isAdmin(senderNumber)) {
                    await msg.reply('⛔ Apenas administradores!');
                    return;
                }
                
                const cooldownMinutes = checkCooldown(senderNumber);
                if (cooldownMinutes > 0) {
                    await msg.reply(`⏳ Aguarde ${cooldownMinutes} minutos`);
                    return;
                }
                
                if (!checkMentionLimit(senderNumber)) {
                    await msg.reply('⚠️ Limite de menções atingido');
                    return;
                }
                
                await msg.reply('🚀 Iniciando menções...');
                const success = await mentionAll(chat, '🎉 *MUNIZ RIFAS* 🎉\n\nFique atento!');
                
                if (success) {
                    cooldowns.set(senderNumber, Date.now() + COOLDOWN_TIME);
                    await msg.reply('✅ Menções concluídas!');
                } else {
                    await msg.reply('❌ Erro ao mencionar');
                }
            }
        });

        console.log('🚀 Inicializando cliente...');
        await client.initialize();

    } catch (error) {
        console.error('💥 Erro fatal:', error);
        setTimeout(startBot, 10000);
    }
}

// Tratamento de erros
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    setTimeout(startBot, 15000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Encerrando...');
    await mongoose.connection.close();
    process.exit(0);
});

// Iniciar
startBot();
