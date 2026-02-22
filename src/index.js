const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Configurações de ambiente
require('dotenv').config();

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5571988140188';
const SESSION_PATH = process.env.SESSION_PATH || './.wwebjs_auth';
const CLIENT_ID = process.env.CLIENT_ID || 'muniz-rifas-bot';

// Garantir que o diretório de sessão existe
if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true });
}

// Configuração do cliente com correções de conexão
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: CLIENT_ID,
        dataPath: SESSION_PATH
    }),
    puppeteer: {
        headless: true,
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
            '--disable-features=IsolateOrigins,site-per-process'
        ],
        executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined
    },
    qrMaxRetries: 5,
    authTimeoutMs: 60000,
    takeoverOnConflict: true,
    restartOnAuthFail: true
});

// Estado do bot
let isReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Evento: QR Code gerado
client.on('qr', (qr) => {
    console.log('📱 Escaneie o QR Code abaixo:');
    qrcode.generate(qr, { small: true });
    
    // Salvar QR em arquivo para acesso externo se necessário
    fs.writeFileSync('./last-qr.txt', qr);
});

// Evento: Autenticado com sucesso
client.on('authenticated', () => {
    console.log('🔐 Bot autenticado com sucesso!');
    reconnectAttempts = 0; // Resetar tentativas
    
    // Limpar QR code antigo
    if (fs.existsSync('./last-qr.txt')) {
        fs.unlinkSync('./last-qr.txt');
    }
});

// Evento: Falha na autenticação
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    
    // Limpar sessão em caso de falha
    const sessionDir = path.join(SESSION_PATH, `session-${CLIENT_ID}`);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log('🧹 Sessão antiga removida. Reinicie para gerar novo QR.');
    }
});

// Evento: Cliente pronto
client.on('ready', () => {
    console.log('✅ Bot está pronto e conectado!');
    isReady = true;
    reconnectAttempts = 0;
});

// Evento: Desconectado - COM RECONEXÃO AUTOMÁTICA
client.on('disconnected', (reason) => {
    console.warn('⚠️ Bot desconectado. Motivo:', reason);
    isReady = false;
    
    // Tentar reconectar automaticamente
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`🔄 Tentando reconectar... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        
        setTimeout(() => {
            client.initialize().catch(err => {
                console.error('Erro ao reconectar:', err);
            });
        }, 5000 * reconnectAttempts); // Delay crescente
    } else {
        console.error('❌ Máximo de tentativas de reconexão atingido.');
        process.exit(1);
    }
});

// Evento: Mudança de estado
client.on('change_state', state => {
    console.log('🔄 Estado alterado:', state);
});

// Sistema anti-spam e controle de comandos
const cooldowns = new Map();
const mentionLimits = new Map();
const COOLDOWN_TIME = 30 * 60 * 1000; // 30 minutos
const MAX_MENTIONS_PER_HOUR = 3;
const MENTION_INTERVAL = 2 * 60 * 60 * 1000; // 2 horas
const BATCH_SIZE = 50;
const BATCH_DELAY = 10000; // 10 segundos

// Verificar se é admin
function isAdmin(number) {
    return number.replace(/\D/g, '') === ADMIN_NUMBER.replace(/\D/g, '');
}

// Verificar cooldown
function checkCooldown(userId) {
    const now = Date.now();
    if (cooldowns.has(userId)) {
        const expiration = cooldowns.get(userId);
        if (now < expiration) {
            return Math.ceil((expiration - now) / 1000 / 60); // minutos restantes
        }
    }
    return 0;
}

// Verificar limite de menções
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
    
    if (limit.count >= MAX_MENTIONS_PER_HOUR) {
        return false;
    }
    
    limit.count++;
    return true;
}

// Função de menção em lotes
async function mentionAll(chat, text = '') {
    try {
        const participants = await chat.participants;
        const mentions = [];
        const ids = [];
        
        for (const participant of participants) {
            const contact = await client.getContactById(participant.id._serialized);
            mentions.push(contact);
            ids.push(participant.id._serialized);
        }
        
        // Enviar em lotes
        for (let i = 0; i < mentions.length; i += BATCH_SIZE) {
            const batch = mentions.slice(i, i + BATCH_SIZE);
            const batchIds = ids.slice(i, i + BATCH_SIZE);
            
            await chat.sendMessage(text || '🔔 Notificação para todos!', {
                mentions: batchIds
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
    
    // Comando: uau (apenas admin)
    if (msg.body.toLowerCase() === 'uau') {
        const sender = await msg.getContact();
        const senderNumber = sender.number;
        
        // Verificar se é admin
        if (!isAdmin(senderNumber)) {
            await msg.reply('⛔ Apenas administradores podem usar este comando.');
            return;
        }
        
        // Verificar cooldown
        const cooldownMinutes = checkCooldown(senderNumber);
        if (cooldownMinutes > 0) {
            await msg.reply(`⏳ Aguarde ${cooldownMinutes} minutos antes de usar o comando novamente.`);
            return;
        }
        
        // Verificar limite de menções
        if (!checkMentionLimit(senderNumber)) {
            await msg.reply(`⚠️ Limite de ${MAX_MENTIONS_PER_HOUR} menções por hora atingido.`);
            return;
        }
        
        // Executar menção
        await msg.reply('🚀 Iniciando menções automáticas...');
        const success = await mentionAll(chat, '🎉 *MUNIZ RIFAS* 🎉\n\nFique atento às novidades!');
        
        if (success) {
            cooldowns.set(senderNumber, Date.now() + COOLDOWN_TIME);
            await msg.reply('✅ Menções concluídas com sucesso!');
        } else {
            await msg.reply('❌ Erro ao realizar menções.');
        }
    }
});

// Inicialização com tratamento de erros
async function startBot() {
    try {
        console.log('🚀 Iniciando bot...');
        await client.initialize();
    } catch (error) {
        console.error('💥 Erro fatal na inicialização:', error);
        
        // Tentar novamente após 10 segundos
        setTimeout(startBot, 10000);
    }
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Não encerrar imediatamente, tentar manter o bot vivo
    setTimeout(startBot, 15000);
});

// Iniciar
startBot();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Encerrando bot...');
    await client.destroy();
    process.exit(0);
});
