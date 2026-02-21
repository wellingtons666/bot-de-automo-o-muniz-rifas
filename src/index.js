const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');

const config = require('./config');
const MessageHandler = require('./handlers/messageHandler');
const logger = require('./utils/logger');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.messageHandler = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async start() {
        try {
            logger.info('🤖 Iniciando Bot de Menções...');
            logger.info(`👑 Admin configurado: ${config.ADMIN_NUMBER}`);

            // Configuração de autenticação
            const authPath = path.join(__dirname, '..', 'auth_info');
            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            // Cria conexão
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger: logger.child({ level: 'warn' }),
                browser: ['Bot Menções', 'Chrome', '1.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            this.messageHandler = new MessageHandler(this.sock);

            // Evento de QR Code
            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    logger.info('📱 Escaneie o QR Code acima para conectar');
                    qrcode.generate(qr, { small: true });
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        logger.info(`🔄 Reconectando... Tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                        setTimeout(() => this.start(), 5000);
                    } else {
                        logger.error('❌ Conexão encerrada. Não foi possível reconectar.');
                        process.exit(1);
                    }
                }

                if (connection === 'open') {
                    this.reconnectAttempts = 0;
                    logger.info('✅ Bot conectado com sucesso!');
                    logger.info(`📝 Comando de ativação: "${config.TRIGGER_COMMAND}"`);
                    logger.info('🔒 Apenas o administrador pode usar o comando');
                }
            });

            // Salva credenciais
            this.sock.ev.on('creds.update', saveCreds);

            // Processa mensagens
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const msg of messages) {
                        await this.messageHandler.handle(msg);
                    }
                }
            });

            // Log de erros
            this.sock.ev.on('error', (error) => {
                logger.error('Erro na conexão:', error);
            });

        } catch (error) {
            logger.error('Erro fatal ao iniciar bot:', error);
            process.exit(1);
        }
    }
}

// Inicia o bot
const bot = new WhatsAppBot();
bot.start();

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    logger.error('Exceção não capturada:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Rejeição não tratada:', reason);
});
