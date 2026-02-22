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

// ========== FUNÇÕES ==========
function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
}

function isAdmin(userId) {
    const cleanNumber = userId.replace(/@c\.us|@g\.us/g, '');
    const cleanAdmin = ADMIN_NUMBER.replace(/@c\.us|@g\.us/g, '');
    return cleanNumber === cleanAdmin || cleanNumber.includes(cleanAdmin) || cleanAdmin.includes(cleanNumber);
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
                    body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding: 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; min-height: 100vh; margin: 0; }
                    .container { max-width: 900px; margin: 0 auto; }
                    .status { padding: 25px; border-radius: 15px; margin: 20px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
                    .online { background: linear-gradient(135deg, #28a745, #20c997); }
                    .offline { background: linear-gradient(135deg, #dc3545, #c82333); }
                    .waiting { background: linear-gradient(135deg, #ffc107, #ff9800); color: #000; }
                    img { max-width: 280px; margin: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
                    .logs { background: rgba(0,0,0,0.4); padding: 20px; border-radius: 10px; text-align: left; font-family: 'Courier New', monospace; font-size: 13px; max-height: 250px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); }
                    h1 { color: #ffd700; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); }
                    .info { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Bot Muniz Rifas</h1>
                    <div class="status ${isReady ? 'online' : qrCodeImage ? 'waiting' : 'offline'}">
                        <h2>Status: ${botStatus}</h2>
                        ${isReady ? '<p>✅ Bot está funcionando!</p>' : ''}
                    </div>
                    
                    ${qrCodeImage ? `
                        <div class="info">
                            <h3>📱 Escaneie o QR Code:</h3>
                            <img src="${qrCodeImage}" />
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
    res.json({ status: botStatus, connected: isReady, admin: ADMIN_NUMBER });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
    log(`🌐 Servidor HTTP na porta ${PORT}`);
    setTimeout(initBot, 1000);
});

// ========== BOT WHATSAPP - CONFIGURAÇÃO CORRIGIDA ==========
function initBot() {
    try {
        log('🤖 Iniciando bot WhatsApp...');
        botStatus = 'Iniciando...';

        // CORREÇÃO 1: Usar webVersionCache remoto (evita erros de versão)
        // CORREÇÃO 2: takeoverOnConflict = true (evita desconexões)
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
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-breakpad',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                    '--disable-ipc-flooding-protection'
                ],
                timeout: 120000 // Aumentado para 120s
            },
            // CORREÇÃO 3: Web version cache remoto (ESSENCIAL!)
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            },
            // CORREÇÃO 4: Tenta reconectar se houver conflito
            takeoverOnConflict: true,
            takeoverTimeoutMs: 0
        });

        // ========== EVENTOS DE CONEXÃO ==========
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
            log('✅ Bot pronto e conectado!');
            isReady = true;
            botStatus = 'Online ✅';
            qrCodeImage = '';
        });

        client.on('authenticated', () => {
            log('🔓 Autenticado no WhatsApp');
            botStatus = 'Autenticado';
        });

        client.on('auth_failure', (msg) => {
            log('❌ Falha na autenticação: ' + msg);
            botStatus = 'Falha auth';
        });

        client.on('disconnected', (reason) => {
            log('🔌 Desconectado: ' + reason);
            isReady = false;
            botStatus = 'Reconectando...';
            qrCodeImage = '';
            setTimeout(() => client.initialize().catch(e => log('Erro reconectar: ' + e.message)), 5000);
        });

        // ========== CORREÇÃO 5: USAR 'message_create' EM VEZ DE 'message' ==========
        // 'message_create' é mais confiável no Railway/headless
        client.on('message_create', async (msg) => {
            
            // Log para debug
            log(`📩 MSG: "${msg.body?.substring(0, 30)}" | De: ${msg.from} | Autor: ${msg.author || 'N/A'}`);
            
            // Ignora mensagens do próprio bot
            if (msg.fromMe) {
                return;
            }
            
            // Só processa se tiver body
            if (!msg.body) return;
            
            const command = msg.body.toLowerCase().trim();
            const userId = msg.author || msg.from;
            
            // ========== COMANDO TESTE (SIMPLIFICADO) ==========
            if (command === '!teste') {
                log('🧪 COMANDO TESTE DETECTADO!');
                try {
                    await msg.reply('🤖 *Bot funcionando!*\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                    log('✅ Resposta enviada');
                } catch (err) {
                    log('❌ Erro ao responder: ' + err.message);
                }
                return;
            }
            
            // ========== COMANDO MSG (MENÇÕES) ==========
            if (command === 'msg') {
                log('🎯 COMANDO MSG DETECTADO!');
                
                // Verifica se é admin
                if (!isAdmin(userId)) {
                    log('❌ Não é admin: ' + userId);
                    await msg.reply('⛔ Apenas administradores podem usar este comando.\nSeu ID: ' + userId);
                    return;
                }
                
                // Pega o chat
                let chat;
                try {
                    chat = await msg.getChat();
                } catch (err) {
                    log('Erro ao pegar chat: ' + err.message);
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
                
                log('✅ É grupo: ' + chat.name);
                
                // Verifica se bot é admin
                const botId = client.info.wid._serialized;
                const botParticipant = chat.participants.find(p => p.id._serialized === botId);
                
                if (!botParticipant || !botParticipant.isAdmin) {
                    log('❌ Bot não é admin');
                    await msg.reply('⚠️ O bot precisa ser ADMIN do grupo!\nAdicione-o como administrador nas configurações do grupo.');
                    return;
                }
                
                log('✅ Bot é admin');
                
                // Registra cooldown
                cooldowns.set(userId, Date.now());
                
                // Envia mensagem inicial
                await msg.reply('🚀 Iniciando menções...\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                
                try {
                    // Pega participantes válidos
                    const participants = chat.participants;
                    const validParticipants = participants.filter(p => {
                        const isBot = p.id._serialized === botId;
                        const isBroadcast = p.id._serialized.includes('broadcast');
                        return !isBot && !isBroadcast;
                    });
                    
                    log(`👥 Total: ${validParticipants.length} participantes`);
                    
                    if (validParticipants.length === 0) {
                        await msg.reply('❌ Nenhum participante válido.');
                        return;
                    }
                    
                    // CORREÇÃO 6: Lotes menores (máx 100 para evitar erros)
                    const batchSize = 100; // Reduzido de 50 para 100 (teste com 50 se falhar)
                    const delayMs = 5000; // 5 segundos entre lotes
                    let mentioned = 0;
                    
                    // Processa em lotes
                    for (let i = 0; i < validParticipants.length; i += batchSize) {
                        const batch = validParticipants.slice(i, i + batchSize);
                        
                        // CORREÇÃO 7: Formato correto de mentions
                        const mentions = batch.map(p => p.id._serialized);
                        const mentionText = batch.map(p => `@${p.id.user}`).join(' ');
                        
                        const messageText = `🎰 *Qual bicho coloco pra você?🤑🤑*\n\n${mentionText}`;
                        
                        try {
                            log(`📤 Enviando lote: ${batch.length} menções`);
                            
                            // CORREÇÃO 8: Opções otimizadas para performance
                            await chat.sendMessage(messageText, {
                                mentions: mentions,
                                sendSeen: false, // Mais rápido
                                linkPreview: false // Evita delays
                            });
                            
                            mentioned += batch.length;
                            log(`✅ Lote enviado: ${mentioned}/${validParticipants.length}`);
                            
                            // Delay entre lotes
                            if (i + batchSize < validParticipants.length) {
                                await new Promise(r => setTimeout(r, delayMs));
                            }
                            
                        } catch (err) {
                            log(`❌ Erro no lote: ${err.message}`);
                            // Continua com próximo
                        }
                    }
                    
                    // Mensagem final
                    await msg.reply(`✅ *Concluído!*\n📊 ${mentioned}/${validParticipants.length} membros mencionados\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                    log('✅ Menções concluídas');
                    
                } catch (err) {
                    log('❌ Erro geral: ' + err.message);
                    await msg.reply('❌ Erro: ' + err.message);
                }
            }
            
            // ========== COMANDO AJUDA ==========
            if (command === '!ajuda' || command === '!comandos') {
                const helpText = `
🤖 *Bot Muniz Rifas*

📌 *Comandos:*
• \`msg\` - Menciona TODOS (só Admin)
• \`!teste\` - Testa o bot
• \`!ajuda\` - Esta mensagem

⚠️ *Importante:*
• Bot precisa ser ADMIN do grupo
• Cooldown: ${COOLDOWN_MINUTES} minutos
• Máx 100 menções por vez

🎰 *Qual bicho coloco pra você?🤑🤑*
                `;
                await msg.reply(helpText);
            }
            
            // Resposta automática
            if (msg.body.toLowerCase().includes('bicho') && !msg.fromMe) {
                await msg.reply('🎰 *Qual bicho coloco pra você?🤑🤑*');
            }
        });

        // ========== CORREÇÃO 9: Evento 'message_revoked' para debug ==========
        client.on('message_revoked_everyone', async (after, before) => {
            log(`🗑️ Mensagem apagada: ${before?.body?.substring(0, 30)}`);
        });

        // Inicializa
        client.initialize().catch(err => {
            log('❌ Erro ao inicializar: ' + err.message);
            botStatus = 'Erro init';
        });

    } catch (error) {
        log('❌ Erro fatal: ' + error.message);
        botStatus = 'Erro fatal';
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    log('SIGTERM recebido, encerrando...');
    server.close(() => {
        if (client) client.destroy();
        process.exit(0);
    });
});
