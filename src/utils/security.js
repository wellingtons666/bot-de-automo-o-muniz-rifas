const config = require('../config');
const logger = require('./logger');

class SecurityManager {
    constructor() {
        this.mentionHistory = new Map(); // groupId -> { count, lastMention, cooldownEnd }
        this.autoMentionGroups = new Set();
        this.isRunning = false;
    }

    // Verifica se é o admin
    isAdmin(userId) {
        const cleanNumber = userId.replace(/@s\.whatsapp\.net|@c\.us/g, '');
        return cleanNumber === config.ADMIN_NUMBER;
    }

    // Verifica cooldown
    checkCooldown(groupId) {
        const now = Date.now();
        const history = this.mentionHistory.get(groupId);

        if (!history) return { allowed: true, remainingTime: 0 };

        // Se está em cooldown
        if (now < history.cooldownEnd) {
            const remainingMinutes = Math.ceil((history.cooldownEnd - now) / 60000);
            return { allowed: false, remainingTime: remainingMinutes };
        }

        // Reseta se passou 1 hora
        if (now - history.lastMention > 3600000) {
            history.count = 0;
        }

        // Verifica limite por hora
        if (history.count >= config.MAX_MENTIONS_PER_HOUR) {
            const remainingMinutes = Math.ceil((3600000 - (now - history.lastMention)) / 60000);
            return { allowed: false, remainingTime: remainingMinutes };
        }

        return { allowed: true, remainingTime: 0 };
    }

    // Registra nova menção
    registerMention(groupId) {
        const now = Date.now();
        const history = this.mentionHistory.get(groupId) || { count: 0, lastMention: 0 };

        history.count++;
        history.lastMention = now;
        history.cooldownEnd = now + (config.COOLDOWN_MINUTES * 60000);

        this.mentionHistory.set(groupId, history);
        
        logger.info(`Menção registrada para grupo ${groupId}. Total: ${history.count}`);
    }

    // Adiciona grupo às menções automáticas
    enableAutoMention(groupId) {
        this.autoMentionGroups.add(groupId);
        logger.info(`Menções automáticas ativadas para grupo: ${groupId}`);
    }

    // Remove grupo das menções automáticas
    disableAutoMention(groupId) {
        this.autoMentionGroups.delete(groupId);
        logger.info(`Menções automáticas desativadas para grupo: ${groupId}`);
    }

    // Verifica se tem menção automática ativa
    isAutoMentionEnabled(groupId) {
        return this.autoMentionGroups.has(groupId);
    }

    // Lista grupos com auto-menção
    getAutoMentionGroups() {
        return Array.from(this.autoMentionGroups);
    }
}

module.exports = new SecurityManager();
