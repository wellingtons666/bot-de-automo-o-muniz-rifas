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

           
