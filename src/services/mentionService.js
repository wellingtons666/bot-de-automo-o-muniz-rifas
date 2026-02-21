const config = require('../config/index.js');
const security = require('../utils/security.js');
const logger = require('../utils/logger.js');

class MentionService {
    constructor(sock) {
        this.sock = sock;
        this.isProcessing = false;
    }

    // Gera intervalo aleatório entre 3-6 minutos
    getRandomInterval() {
        const min = config.AUTO_MENTION_MIN;
        const max = config.AUTO_MENTION_MAX;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Divide array em lotes
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    // Delay helper
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Envia menção com segurança anti-spam
    async sendMention(groupId, isAuto = false) {
        try {
            if (this.isProcessing && !isAuto) {
                logger.warn('Já existe uma menção em processamento');
                return { success: false, error: 'Processo em andamento' };
            }

            this.isProcessing = true;

            // Obtém metadata do grupo
            const groupMetadata = await this.sock.groupMetadata(groupId);
            const participants = groupMetadata.participants;

            if (participants.length === 0) {
                this.isProcessing = false;
                return { success: false, error: 'Grupo sem participantes' };
            }

            logger.info(`Iniciando menção ${isAuto ? 'automática' : 'manual'} para ${participants.length} membros no grupo ${groupId}`);

            // Divide em lotes para evitar ban
            const batches = this.chunkArray(participants, config.MAX_BATCH_SIZE);
            let totalMentioned = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const mentions = batch.map(p => p.id);
                
                // Cria texto com @numero para cada um
                const mentionText = batch.map(p => {
                    const number = p.id.split('@')[0];
                    return `@${number}`;
                }).join(' ');

                // Mensagem personalizada
                const messageText = isAuto 
                    ? `🔔 *LEMBRETE AUTOMÁTICO*\n\n${mentionText}\n\n📢 Não perca as novidades do grupo!`
                    : `🔔 *ATENÇÃO*\n\n${mentionText}\n\n📢 Mensagem importante do administrador!`;

                // Envia mensagem
                await this.sock.sendMessage(groupId, {
                    text: messageText,
                    mentions: mentions
                });

                totalMentioned += batch.length;
                logger.info(`Lote ${i + 1}/${batches.length} enviado: ${batch.length} menções`);

                // Delay entre lotes (anti-spam)
                if (i < batches.length - 1) {
                    await this.delay(config.BATCH_DELAY);
                }
            }

            // Registra no security (passa isAuto para controle correto)
            security.registerMention(groupId, isAuto);

            logger.info(`✅ Menção ${isAuto ? 'automática' : 'manual'} completa: ${totalMentioned} membros mencionados`);
            this.isProcessing = false;

            return { success: true, count: totalMentioned };

        } catch (error) {
            this.isProcessing = false;
            logger.error('Erro ao enviar menção:', error);
            return { success: false, error: error.message };
        }
    }

    // Inicia menções automáticas com intervalo aleatório 3-6 minutos
    startAutoMention(groupId) {
        security.enableAutoMention(groupId);
        
        const interval = this.getRandomInterval();
        const minutes = Math.round(interval / 60000 * 10) / 10;
        
        logger.info(`Próxima menção automática para ${groupId} em ${minutes} minutos`);
        
        // Agenda próxima menção
        setTimeout(async () => {
            if (security.isAutoMentionEnabled(groupId)) {
                const check = security.checkCooldown(groupId, true); // true = isAuto
                
                if (check.allowed) {
                    await this.sendMention(groupId, true);
                } else {
                    logger.info(`Auto-menção pulada para ${groupId} - cooldown ativo`);
                }
                
                // Reagenda com novo intervalo aleatório
                this.startAutoMention(groupId);
            }
        }, interval);
    }

    // Para menções automáticas
    stopAutoMention(groupId) {
        security.disableAutoMention(groupId);
    }
}

module.exports = MentionService;
