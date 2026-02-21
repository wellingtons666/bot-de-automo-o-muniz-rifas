const config = require('../config/index.js');
const logger = require('./logger.js');

class SecurityManager {
    constructor() {
        this.mentionHistory = new Map();
        this.autoMentionGroups = new Set();
        this.isRunning = false;
    }

    isAdmin(userId) {
        const cleanNumber = userId.replace(/@s\.whatsapp\.net|@c\.us/g, '');
        return cleanNumber === config.ADMIN_NUMBER;
    }

    checkCooldown(groupId, isAuto = false) {
        if (!isAuto) return { allowed: true, remainingTime: 0 };
        
        const now = Date.now();
        const history = this.mentionHistory.get(groupId);

        if (!history) return { allowed: true, remainingTime: 0 };

        if (now < history.cooldownEnd) {
            const remainingMinutes = Math.ceil((history.cooldownEnd - now) / 60000);
            return { allowed: false, remainingTime: remainingMinutes };
        }

        if (now - history.lastMention > 3600000) {
            history.count = 0;
        }

        if (history.count >= config.MAX_MENTIONS_PER_HOUR) {
            const remainingMinutes = Math.ceil((3600000 - (now - history.lastMention)) / 60000);
            return { allowed: false, remainingTime: remainingMinutes };
        }

        return { allowed: true, remainingTime: 0 };
    }

    registerMention(groupId, isAuto = false) {
        const now = Date.now();
        const history = this.mentionHistory.get(groupId) || { count: 0, lastMention: 0 };

        history.count++;
        history.lastMention = now;
        
        if (isAuto) {
            history.cooldownEnd = now + (config.COOLDOWN_MINUTES * 60000);
        }

        this.mentionHistory.set(groupId, history);
        
        logger.info(`Menção ${isAuto ? 'automática' : 'manual'} registrada para grupo ${groupId}. Total: ${history.count}`);
    }

    enableAutoMention(groupId) {
        this.autoMentionGroups.add(groupId);
        logger.info(`Menções automáticas ativadas para grupo: ${groupId}`);
    }

    disableAutoMention(groupId) {
        this.autoMentionGroups.delete(groupId);
        logger.info(`Menções automáticas desativadas para grupo: ${groupId}`);
    }

    isAutoMentionEnabled(groupId) {
        return this.autoMentionGroups.has(groupId);
    }

    getAutoMentionGroups() {
        return Array.from(this.autoMentionGroups);
    }
}

module.exports = new SecurityManager();
