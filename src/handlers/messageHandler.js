const config = require('../config/index.js');
const security = require('../utils/security.js');
const MentionService = require('../services/mentionService.js');
const logger = require('../utils/logger.js');

class MessageHandler {
    constructor(sock) {
        this.sock = sock;
        this.mentionService = new MentionService(sock);
    }

    async handle(msg) {
        try {
            // Ignora mensagens de status/broadcast
            if (!msg.key || !msg.key.remoteJid) return;

            const chatId = msg.key.remoteJid;
            const sender = msg.key.participant || msg.key.remoteJid;

            // Só processa grupos
            if (!chatId.endsWith('@g.us')) return;

            // Extrai texto da mensagem
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text;
            }

            text = text.toLowerCase().trim();

            // Verifica comando "uau"
            if (text === config.TRIGGER_COMMAND) {
                await this.handleUauCommand(chatId, sender, msg);
            }

        } catch (error) {
            logger.error('Erro ao processar mensagem:', error);
        }
    }

    async handleUauCommand(chatId, sender, msg) {
        // Verifica se é admin
        if (!security.isAdmin(sender)) {
            await this.sock.sendMessage(chatId, {
                text: config.MESSAGES.NO_PERMISSION,
                quoted: msg
            });
            logger.warn(`Tentativa não autorizada de ${sender}`);
            return;
        }

        // Verifica cooldown
        const cooldownCheck = security.checkCooldown(chatId);
        if (!cooldownCheck.allowed) {
            await this.sock.sendMessage(chatId, {
                text: config.MESSAGES.COOLDOWN_ACTIVE(cooldownCheck.remainingTime),
                quoted: msg
            });
            return;
        }

        // Envia confirmação
        await this.sock.sendMessage(chatId, {
            text: '🚀 Iniciando menção segura...',
            quoted: msg
        });

        // Executa menção
        const result = await this.mentionService.sendMention(chatId, false);

        if (result.success) {
            await this.sock.sendMessage(chatId, {
                text: config.MESSAGES.MENTION_SENT(result.count)
            });

            // Ativa menções automáticas se ainda não estiver ativa
            if (!security.isAutoMentionEnabled(chatId)) {
                this.mentionService.startAutoMention(chatId);
                await this.sock.sendMessage(chatId, {
                    text: config.MESSAGES.AUTO_MENTION_ENABLED + `\n⏱️ Intervalo: ${config.AUTO_MENTION_INTERVAL / 60000} minutos`
                });
            }
        } else {
            await this.sock.sendMessage(chatId, {
                text: `❌ Erro: ${result.error}`
            });
        }
    }
}

module.exports = MessageHandler;