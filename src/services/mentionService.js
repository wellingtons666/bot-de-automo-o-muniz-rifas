const config = require('../config/index.js');
const security = require('../utils/security.js');
const logger = require('../utils/logger.js');

class MentionService {
    constructor(sock) {
        this.sock = sock;
        this.isProcessing = false;
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendMention(groupId, isAuto = false) {
        try {
            if (this.isProcessing && !isAuto) {
                return { success: false, error: 'Processo em andamento' };
            }

            this.isProcessing = true;
            const groupMetadata = await this.sock.groupMetadata(groupId);
            const participants = groupMetadata.participants;

            if (participants.length === 0) {
                this.isProcessing = false;
                return { success: false, error: 'Grupo sem participantes' };
            }

            logger.info(`Iniciando menção para ${participants.length} membros`);

            const batches = this.chunkArray(participants, config.MAX_BATCH_SIZE);
            let totalMentioned = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const mentions = batch.map(p => p.id);
                const mentionText = batch.map(p => `@${p.id.split('@')[0]}`).join(' ');

                const messageText = isAuto
                    ? `🔔 *LEMBRETE AUTOMÁTICO*\n\n${mentionText}\n\n📢 Não perca as novidades do grupo!`
                    : `🔔 *ATENÇÃO*\n\n${mentionText}\n\n📢 Mensagem importante do administrador!`;

                await this.sock.sendMessage(groupId, {
                    text: messageText,
                    mentions: mentions
                });

                totalMentioned += batch.length;
                logger.info(`Lote ${i + 1}/${batches.length} enviado`);

                if (i < batches.length - 1) {
                    await this.delay(config.BATCH_DELAY);
                }
            }

            security.registerMention(groupId);
            this.isProcessing = false;

            return { success: true, count: totalMentioned };

        } catch (error) {
            this.isProcessing = false;
            logger.error('Erro ao enviar menção:', error);
            return { success: false, error: error.message };
        }
    }

    startAutoMention(groupId) {
        security.enableAutoMention(groupId);
        
        const interval = config.getAutoMentionInterval();
        logger.info(`Próxima menção automática em ${interval/60000} minutos`);

        setTimeout(async () => {
            if (security.isAutoMentionEnabled(groupId)) {
                const check = security.checkCooldown(groupId);
                if (check.allowed) {
                    await this.sendMention(groupId, true);
                }
                this.startAutoMention(groupId);
            }
        }, interval);
    }

    stopAutoMention(groupId) {
        security.disableAutoMention(groupId);
    }
}

module.exports = MentionService;
