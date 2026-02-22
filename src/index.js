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
const MENTION_LIMIT = parseInt(process.env.MENTION_LIMIT) || 3;

const cooldowns = new Map();
const mentionCounts = new Map();

// ========== FUNÇÕES UTILITÁRIAS ==========
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
}

function isAdmin(userId) {
    // Remove @c.us ou @g.us para comparar
    const cleanNumber = userId.replace(/@c\.us|@g\.us/g, '');
    return cleanNumber.includes(ADMIN_NUMBER) || ADMIN_NUMBER.includes(cleanNumber);
}

function checkCooldown(userId) {
    const lastUse = cooldowns.get(userId);
    if (!lastUse) return { canUse: true, remaining: 0 };
    
    const diff = Date.now() - lastUse;
    const minutesPassed = diff / (1000 * 60);
    
    if (minutesPassed >= COOLDOWN_MINUTES) {
        return { canUse: true, remaining: 0 };
    }
    
    return { 
        canUse: false, 
        remaining: Math.ceil(COOLDOWN_MINUTES - minutesPassed) 
    };
}

// ========== SERVIDOR HTTP ==========
app.use(express.json());

app.get('/', (req, res) => {
    const recentLogs = logs.slice(-20).join('<br>');
    res.send(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Bot Muniz Rifas</title>
                <meta http-equiv="refresh" content="10">
                <style>
                    body { 
                        font-family: 'Segoe UI', Arial, sans-serif; 
                        text-align: center; 
                        padding: 30px; 
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
                        color: white;
                        min-height: 100vh;
                        margin: 0;
                    }
                    .container { max-width: 900px; margin: 0 auto; }
                    .status { 
                        padding: 25px; 
                        border-radius: 15px; 
                        margin: 20px 0; 
                        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    }
                    .online { background: linear-gradient(135deg, #28a745, #20c997); }
                    .offline { background: linear-gradient(135deg, #dc3545, #c82333); }
                    .waiting { background: linear-gradient(135deg, #ffc107, #ff9800); color: #000; }
                    img { 
                        max-width: 280px; 
                        margin: 20px; 
                        border-radius: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                    }
                    .logs { 
                        background: rgba(0,0,0,0.4); 
                        padding: 20px; 
                        border-radius: 10px; 
                        text-align: left; 
                        font-family: 'Courier New', monospace; 
                        font-size: 13px; 
                        max-height: 250px; 
                        overflow-y: auto;
                        border: 1px solid rgba(255,255,255,0.1);
                    }
                    h1 { color: #ffd700; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); }
                    .info { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Bot Muniz Rifas</h1>
                    <div class="status ${isReady ? 'online' : qrCodeImage ? 'waiting' : 'offline'}">
                        <h2>Status: ${botStatus}</h2>
                        ${isReady ? '<p>✅ Bot está funcionando perfeitamente!</p>' : ''}
                    </div>
                    
                    ${qrCodeImage ? `
                        <div class="info">
                            <h3>📱 Escaneie o QR Code com o WhatsApp:</h3>
                            <img src="${qrCodeImage}" />
                            <p>Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho</p>
                        </div>
                    ` : ''}
                    
                    <div class="info">
                        <h3>📝 Logs recentes:</h3>
                        <div class="logs">${recentLogs}</div>
                    </div>
                    
                    <p style="margin-top: 30px; opacity: 0.7;">Última atualização: ${new Date().toLocaleString('pt-BR')}</p>
                </div>
            </body>
        </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        status: botStatus,
        connected: isReady,
        admin: ADMIN_NUMBER,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
    log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
    setTimeout(initBot, 1000);
});

// ========== BOT WHATSAPP ==========
function initBot() {
    try {
        log('🤖 Iniciando bot...');
        botStatus = 'Iniciando...';

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
                timeout: 60000
            }
        });

        // Eventos
        client.on('qr', async (qr) => {
            log('🔐 QR Code gerado!');
            botStatus = 'Aguardando QR Code...';
            try {
                qrCodeImage = await qrcode.toDataURL(qr);
            } catch (err) {
                log('Erro QR: ' + err.message);
            }
        });

        client.on('ready', () => {
            log('✅ Bot pronto!');
            isReady = true;
            botStatus = 'Online ✅';
            qrCodeImage = '';
        });

        client.on('authenticated', () => {
            log('🔓 Autenticado!');
            botStatus = 'Autenticado';
        });

        client.on('auth_failure', (msg) => {
            log('❌ Falha auth: ' + msg);
            botStatus = 'Falha na autenticação';
        });

        client.on('disconnected', (reason) => {
            log('🔌 Desconectado: ' + reason);
            isReady = false;
            botStatus = 'Reconectando...';
            qrCodeImage = '';
            setTimeout(() => client.initialize().catch(e => log('Erro reconectar: ' + e.message)), 5000);
        });

        setupCommands();
        
        client.initialize().catch(err => {
            log('❌ Erro init: ' + err.message);
            botStatus = 'Erro';
        });

    } catch (error) {
        log('❌ Erro fatal: ' + error.message);
        botStatus = 'Erro fatal';
    }
}

// ========== COMANDOS ==========
function setupCommands() {
    
    // Comando UAU - Menções
    client.on('message_create', async (msg) => {
        if (msg.fromMe) return;
        
        const chat = await msg.getChat();
        const userId = msg.author || msg.from;
        const command = msg.body.toLowerCase().trim();
        
        // Comando UAU
        if (command === 'uau') {
            log(`📩 Comando UAU de ${userId}`);
            
            // Verifica admin
            if (!isAdmin(userId)) {
                await msg.reply('⛔ Apenas administradores podem usar este comando.');
                log('❌ Tentativa não autorizada');
                return;
            }
            
            // Verifica cooldown
            const cooldown = checkCooldown(userId);
            if (!cooldown.canUse) {
                await msg.reply(`⏳ Aguarde ${cooldown.remaining} minutos.`);
                return;
            }
            
            // Verifica se é grupo
            if (!chat.isGroup) {
                await msg.reply('❌ Este comando só funciona em grupos!');
                return;
            }
            
            // Verifica se bot é admin
            const botId = client.info.wid._serialized;
            const botParticipant = chat.participants.find(p => p.id._serialized === botId);
            
            if (!botParticipant || !botParticipant.isAdmin) {
                await msg.reply('⚠️ O bot precisa ser administrador do grupo para mencionar todos!');
                log('❌ Bot não é admin');
                return;
            }
            
            // Inicia processo
            cooldowns.set(userId, Date.now());
            await msg.reply('🚀 Iniciando menções...\n💬 *Qual bicho coloco pra você?🤑🤑*');
            log('🚀 Iniciando menções em: ' + chat.name);
            
            try {
                const participants = chat.participants;
                const total = participants.length;
                const batchSize = 50;
                let mentioned = 0;
                let batchCount = 0;
                
                // Filtra apenas usuários válidos (exclui o próprio bot)
                const validParticipants = participants.filter(p => 
                    p.id._serialized !== botId && !p.id._serialized.includes('broadcast')
                );
                
                log(`👥 Total de participantes: ${validParticipants.length}`);
                
                // Processa em lotes
                for (let i = 0; i < validParticipants.length; i += batchSize) {
                    batchCount++;
                    const batch = validParticipants.slice(i, i + batchSize);
                    
                    // Cria array de menções no formato correto
                    const mentions = batch.map(p => p.id._serialized);
                    
                    // Cria texto com @usuario para cada um
                    const mentionText = batch.map(p => `@${p.id.user}`).join(' ');
                    
                    // Mensagem com a frase solicitada
                    const messageText = `🎰 *Qual bicho coloco pra você?🤑🤑*\n\n${mentionText}`;
                    
                    try {
                        // Envia com mentions explícitas
                        await chat.sendMessage(messageText, {
                            mentions: mentions,
                            sendSeen: true
                        });
                        
                        mentioned += batch.length;
                        log(`✅ Lote ${batchCount}: ${batch.length} menções enviadas`);
                        
                        // Delay entre lotes (exceto no último)
                        if (i + batchSize < validParticipants.length) {
                            await new Promise(r => setTimeout(r, 10000)); // 10 segundos
                        }
                        
                    } catch (err) {
                        log(`❌ Erro no lote ${batchCount}: ${err.message}`);
                        // Continua com o próximo lote mesmo se falhar
                    }
                }
                
                // Mensagem final
                await msg.reply(`✅ *Menções concluídas!*\n📊 Total: ${mentioned}/${validParticipants.length} membros\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                log(`✅ Concluído: ${mentioned} menções`);
                
            } catch (err) {
                log('❌ Erro geral: ' + err.message);
                await msg.reply('❌ Erro ao executar menções. Verifique se o bot é admin!');
            }
        }
        
        // Comando de teste simples
        if (command === '!teste') {
            await msg.reply('🤖 Bot está funcionando!\n🎰 *Qual bicho coloco pra você?🤑🤑*');
        }
        
        // Comando de ajuda
        if (command === '!ajuda' || command === '!comandos') {
            const helpText = `
🤖 *Bot Muniz Rifas - Comandos*

📌 *Comandos Admin:*
• \`uau\` - Menciona TODOS do grupo (silenciados ou não)
• \`!teste\` - Testa se o bot responde

ℹ️ *Informações:*
• Cooldown: ${COOLDOWN_MINUTES} minutos
• Lotes: 50 menções por vez
• O bot precisa ser ADMIN do grupo

🎰 *Qual bicho coloco pra você?🤑🤑*
            `;
            await msg.reply(helpText);
        }
        
        // Responde a mensagens específicas
        if (msg.body.toLowerCase().includes('bicho') || msg.body.toLowerCase().includes('jogo')) {
            // Responde automaticamente se alguém mencionar bicho/jogo
            if (!msg.fromMe) {
                await msg.reply('🎰 *Qual bicho coloco pra você?🤑🤑*');
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
