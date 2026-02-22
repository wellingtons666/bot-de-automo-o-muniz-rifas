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

 // ========== BOT WHATSAPP ==========
 function initBot() {
     try {
         log('🤖 Iniciando bot WhatsApp...');
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

         // Eventos de conexão
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

         // ========== COMANDOS - EVENTO 'message' ==========
         client.on('message', async (msg) => {
             
             // Log para debug - veja no Railway se está chegando mensagens
             log(`📩 Mensagem recebida: "${msg.body}" de ${msg.from}`);
             
             // Ignora mensagens do próprio bot (evita loop)
             if (msg.fromMe) {
                 log('Ignorando mensagem do próprio bot');
                 return;
             }
             
             // Pega informações do chat e usuário
             let chat;
             try {
                 chat = await msg.getChat();
             } catch (err) {
                 log('Erro ao pegar chat: ' + err.message);
                 return;
             }
             
             const userId = msg.author || msg.from;
             const command = msg.body.toLowerCase().trim();
             
             log(`Comando processado: "${command}" | User: ${userId} | Chat: ${chat.name || 'Privado'}`);
             
             // ========== COMANDO MSG (antigo UAU) ==========
             if (command === 'msg') {
                 log('🎯 COMANDO MSG DETECTADO!');
                 
                 // Verifica se é admin
                 if (!isAdmin(userId)) {
                     log('❌ Usuário não é admin: ' + userId);
                     await msg.reply('⛔ Apenas administradores podem usar este comando.\nSeu ID: ' + userId);
                     return;
                 }
                 
                 log('✅ Admin confirmado: ' + userId);
                 
                 // Verifica cooldown
                 const cooldown = checkCooldown(userId);
                 if (!cooldown.canUse) {
                     await msg.reply(`⏳ Aguarde ${cooldown.remaining} minutos para usar novamente.`);
                     return;
                 }
                 
                 // Verifica se é grupo
                 if (!chat.isGroup) {
                     log('❌ Não é grupo');
                     await msg.reply('❌ Este comando só funciona em grupos!');
                     return;
                 }
                 
                 log('✅ É grupo: ' + chat.name);
                 
                 // Verifica se bot é admin
                 const botId = client.info.wid._serialized;
                 const botParticipant = chat.participants.find(p => p.id._serialized === botId);
                 
                 if (!botParticipant || !botParticipant.isAdmin) {
                     log('❌ Bot não é admin do grupo');
                     await msg.reply('⚠️ O bot precisa ser ADMIN do grupo para mencionar todos!\n\nAdicione o bot como administrador nas configurações do grupo.');
                     return;
                 }
                 
                 log('✅ Bot é admin do grupo');
                 
                 // Registra cooldown
                 cooldowns.set(userId, Date.now());
                 
                 // Envia mensagem inicial
                 await msg.reply('🚀 Iniciando menções em massa...\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                 log('🚀 Iniciando menções...');
                 
                 try {
                     // Pega todos os participantes (incluindo silenciados)
                     const participants = chat.participants;
                     const total = participants.length;
                     
                     // Filtra: remove o próprio bot e broadcasts
                     const validParticipants = participants.filter(p => {
                         const isBot = p.id._serialized === botId;
                         const isBroadcast = p.id._serialized.includes('broadcast');
                         return !isBot && !isBroadcast;
                     });
                     
                     log(`👥 Total no grupo: ${total} | Válidos: ${validParticipants.length}`);
                     
                     if (validParticipants.length === 0) {
                         await msg.reply('❌ Nenhum participante válido encontrado.');
                         return;
                     }
                     
                     // Configurações de lotes
                     const batchSize = 50;
                     const delayMs = 10000; // 10 segundos
                     let mentioned = 0;
                     let batchCount = 0;
                     
                     // Processa em lotes
                     for (let i = 0; i < validParticipants.length; i += batchSize) {
                         batchCount++;
                         const batch = validParticipants.slice(i, i + batchSize);
                         
                         // Cria array de IDs para mentions
                         const mentions = batch.map(p => p.id._serialized);
                         
                         // Cria texto com @usuario
                         const mentionText = batch.map(p => `@${p.id.user}`).join(' ');
                         
                         // Mensagem completa
                         const messageText = `🎰 *Qual bicho coloco pra você?🤑🤑*\n\n${mentionText}`;
                         
                         try {
                             log(`📤 Enviando lote ${batchCount}: ${batch.length} menções`);
                             
                             // Envia a mensagem com mentions
                             await chat.sendMessage(messageText, {
                                 mentions: mentions,
                                 sendSeen: true
                             });
                             
                             mentioned += batch.length;
                             log(`✅ Lote ${batchCount} enviado`);
                             
                             // Delay entre lotes (exceto no último)
                             if (i + batchSize < validParticipants.length) {
                                 log(`⏳ Aguardando ${delayMs/1000}s...`);
                                 await new Promise(r => setTimeout(r, delayMs));
                             }
                             
                         } catch (err) {
                             log(`❌ Erro no lote ${batchCount}: ${err.message}`);
                             // Continua com próximo lote
                         }
                     }
                     
                     // Mensagem final
                     const finalText = `✅ *Menções concluídas!*\n📊 Total: ${mentioned}/${validParticipants.length} membros\n🎰 *Qual bicho coloco pra você?🤑🤑*`;
                     await msg.reply(finalText);
                     log(`✅ Concluído! ${mentioned} menções`);
                     
                 } catch (err) {
                     log('❌ Erro geral: ' + err.message);
                     await msg.reply('❌ Erro ao executar menções: ' + err.message);
                 }
             }
             
             // ========== COMANDO TESTE ==========
             else if (command === '!teste') {
                 log('🧪 Comando TESTE detectado');
                 await msg.reply('🤖 *Bot funcionando!*\n🎰 *Qual bicho coloco pra você?🤑🤑*');
             }
             
             // ========== COMANDO AJUDA ==========
             else if (command === '!ajuda' || command === '!comandos') {
                 log('❓ Comando AJUDA detectado');
                 const helpText = `
 🤖 *Bot Muniz Rifas - Comandos*

 📌 *Comandos:*
 • \`msg\` - Menciona TODOS do grupo (silenciados ou não) *Só Admin*
 • \`!teste\` - Testa se o bot responde
 • \`!ajuda\` - Mostra esta mensagem

 ℹ️ *Requisitos:*
 • Bot precisa ser ADMIN do grupo
 • Cooldown: ${COOLDOWN_MINUTES} minutos entre comandos
 • Lotes de 50 menções com 10s de intervalo

 🎰 *Qual bicho coloco pra você?🤑🤑*
                 `;
                 await msg.reply(helpText);
             }
             
             // ========== RESPOSTA AUTOMÁTICA ==========
             else if (msg.body.toLowerCase().includes('bicho') || msg.body.toLowerCase().includes('jogo do bicho')) {
                 if (!msg.fromMe) {
                     log('🎰 Resposta automática (bicho)');
                     await msg.reply('🎰 *Qual bicho coloco pra você?🤑🤑*');
                 }
             }
         });

         // Inicializa o cliente
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
