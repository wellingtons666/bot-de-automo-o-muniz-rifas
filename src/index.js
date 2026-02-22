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

         client.on('message_create', async (msg) => {
             if (msg.fromMe) return;
             
             const body = msg.body || '';
             const command = body.toLowerCase().trim();
             
             let authorId = msg.author || msg.from;
             if (msg.from && msg.from.endsWith('@g.us')) {
                 authorId = msg.author;
             }
             
             log(`📩 "${body.substring(0, 40)}" | De: ${msg.from} | Autor: ${authorId}`);
             
             if (!authorId) {
                 log('⚠️ Autor não identificado');
                 return;
             }
             
             // ========== COMANDO TESTE ==========
             if (command === '!teste') {
                 log('🧪 TESTE de: ' + authorId);
                 try {
                     await msg.reply('✅ *Bot funcionando!*\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                     log('✅ Resposta enviada');
                 } catch (err) {
                     log('❌ Erro: ' + err.message);
                 }
                 return;
             }
             
             // ========== COMANDO MSG (MENÇÕES FORÇADAS) ==========
             if (command === 'msg') {
                 log('🎯 MSG de: ' + authorId);
                 
                 if (!isAdmin(authorId)) {
                     log('❌ Não é admin: ' + authorId);
                     await msg.reply('⛔ Apenas admin!\nSeu ID: ' + authorId);
                     return;
                 }
                 
                 let chat;
                 try {
                     chat = await msg.getChat();
                 } catch (err) {
                     log('❌ Erro getChat: ' + err.message);
                     return;
                 }
                 
                 if (!chat.isGroup) {
                     await msg.reply('❌ Só funciona em grupos!');
                     return;
                 }
                 
                 log('✅ Grupo: ' + chat.name);
                 
                 const cooldown = checkCooldown(authorId);
                 if (!cooldown.canUse) {
                     await msg.reply(`⏳ Aguarde ${cooldown.remaining} minutos`);
                     return;
                 }
                 
                 const botId = client.info.wid._serialized;
                 const botParticipant = chat.participants.find(p => p.id._serialized === botId);
                 
                 if (!botParticipant || !botParticipant.isAdmin) {
                     log('❌ Bot não é admin');
                     await msg.reply('⚠️ Bot precisa ser ADMIN do grupo!');
                     return;
                 }
                 
                 log('✅ Bot é admin');
                 cooldowns.set(authorId, Date.now());
                 
                 // Mensagem inicial
                 await chat.sendMessage('🚀 *Iniciando menções FORÇADAS...*\n🔔 Todos serão notificados!\n🎰 *Qual bicho coloco pra você?🤑🤑*');
                 
                 try {
                     const participants = chat.participants;
                     const validParticipants = participants.filter(p => {
                         return p.id._serialized !== botId && !p.id._serialized.includes('broadcast');
                     });
                     
                     log(`👥 ${validParticipants.length} participantes`);
                     
                     if (validParticipants.length === 0) {
                         await chat.sendMessage('❌ Nenhum participante válido');
                         return;
                     }
                     
                     // ========== TÉCNICA 1: Mencionar TODOS individualmente com delay mínimo ==========
                     const batchSize = 50; // WhatsApp limita ~100 menções por mensagem
                     let mentioned = 0;
                     
                     for (let i = 0; i < validParticipants.length; i += batchSize) {
                         const batch = validParticipants.slice(i, i + batchSize);
                         
                         // Cria array de mentions no formato correto
                         const mentions = batch.map(p => p.id._serialized);
                         
                         // ========== TÉCNICA 2: Texto com MÚLTIPLAS menções e emojis de alerta ==========
                         // Usar emojis de alerta chama mais atenção na notificação
                         const mentionText = batch.map(p => `@${p.id.user}`).join(' ');
                         
                         // Mensagem com EMOJIS DE ALERTA na frente (chama atenção na notificação)
                         const messageText = `🔔🔔🔔 *ATENÇÃO RIFAS MUNIZ* 🔔🔔🔔\n\n🎰 *Qual bicho coloco pra você?🤑🤑*\n\n${mentionText}\n\n⚠️ *Você foi mencionado e será notificado mesmo com o grupo silenciado!*`;
                         
                         try {
                             log(`📤 Lote ${Math.floor(i/batchSize) + 1}: ${batch.length} menções`);
                             
                             // Envia com mentions explícitas
                             await chat.sendMessage(messageText, {
                                 mentions: mentions,
                                 sendSeen: false,
                                 linkPreview: false
                             });
                             
                             mentioned += batch.length;
                             log(`✅ Enviado: ${mentioned}/${validParticipants.length}`);
                             
                             // Delay menor para não perder o "efeito surpresa"
                             if (i + batchSize < validParticipants.length) {
                                 await new Promise(r => setTimeout(r, 3000)); // 3 segundos apenas
                             }
                             
                         } catch (err) {
                             log(`❌ Erro lote: ${err.message}`);
                         }
                     }
                     
                     // ========== TÉCNICA 3: Mensagem final com @todos (se suportado) ==========
                     // Tentativa de usar @todos para pegar quem ficou de fora
                     try {
                         await chat.sendMessage(`✅ *Notificação forçada concluída!*\n📊 ${mentioned} membros alertados\n🎰 *Qual bicho coloco pra você?🤑🤑*\n\n@everyone`, {
                             mentions: validParticipants.map(p => p.id._serialized)
                         });
                     } catch (e) {
                         // Se @everyone falhar, manda sem
                         await chat.sendMessage(`✅ *Notificação forçada concluída!*\n📊 ${mentioned} membros alertados\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                     }
                     
                     log('✅ CONCLUÍDO - Todos notificados');
                     
                 } catch (err) {
                     log('❌ Erro: ' + err.message);
                     await chat.sendMessage('❌ Erro: ' + err.message);
                 }
             }
             
             // ========== COMANDO MSG2 (MODO AGRESSIVO - Múltiplas mensagens) ==========
             // Este modo envia várias mensagens pequenas para "bombardear" notificações
             if (command === 'msg2') {
                 log('💥 MSG2 (AGRESSIVO) de: ' + authorId);
                 
                 if (!isAdmin(authorId)) {
                     await msg.reply('⛔ Apenas admin!');
                     return;
                 }
                 
                 let chat;
                 try {
                     chat = await msg.getChat();
                 } catch (err) {
                     return;
                 }
                 
                 if (!chat.isGroup) {
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
                     
                     // Envia em grupos de 5 para criar VÁRIAS notificações
                     const miniBatch = 5;
                     let count = 0;
                     
                     for (let i = 0; i < participants.length; i += miniBatch) {
                         const batch = participants.slice(i, i + miniBatch);
                         const mentions = batch.map(p => p.id._serialized);
                         const text = batch.map(p => `@${p.id.user}`).join(' ');
                         
                         await chat.sendMessage(`🔔 ${text}\n🎰 *Qual bicho coloco pra você?🤑🤑*`, { mentions });
                         count += batch.length;
                         
                         // Delay bem curto entre mini-lotes
                         if (i + miniBatch < participants.length) {
                             await new Promise(r => setTimeout(r, 1500)); // 1.5s
                         }
                     }
                     
                     await chat.sendMessage(`✅ *MODO AGRESSIVO CONCLUÍDO!*\n📊 ${count} notificações enviadas\n🎰 *Qual bicho coloco pra você?🤑🤑*`);
                     
                 } catch (err) {
                     log('❌ Erro msg2: ' + err.message);
                 }
             }
             
             // ========== AJUDA ==========
             if (command === '!ajuda') {
                 await msg.reply(`🤖 *Bot Muniz Rifas*

 📌 *Comandos:*
 • \`msg\` - Menciona todos (modo normal)
 • \`msg2\` - Menciona todos (modo agressivo - mais notificações)
 • \`!teste\` - Testa bot

 💡 *Diferença:*
 • \`msg\`: 50 menções por mensagem (mais organizado)
 • \`msg2\`: 5 menções por mensagem (mais notificações, mais "chatão")

 🎰 *Qual bicho coloco pra você?🤑🤑*`);
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
