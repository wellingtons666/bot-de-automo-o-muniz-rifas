const config = require('../config/index.js');

// Lista de admins (atualizada)
const ADMIN_NUMBERS = ['5571999465875', '5571988140188'];

class SecurityManager {
    constructor() {
        this.mentionHistory = new Map();
        this.autoMentionGroups = new Set();
    }

    // Verifica se é admin (um dos dois números)
    isAdmin(userId) {
        const cleanNumber = userId.replace(/@s\.whatsapp\.net|@c\.us/g, '');
        return ADMIN_NUMBERS.includes(cleanNumber);
    }

    checkCooldown(groupId) {
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

    registerMention(groupId) {
        const now = Date.now();
        const history = this.mentionHistory.get(groupId) || { count: 0, lastMention: 0 };

        history.count++;
        history.lastMention = now;
        history.cooldownEnd = now + (config.COOLDOWN_MINUTES * 60000);

        this.mentionHistory.set(groupId, history);
    }

    enableAutoMention(groupId) {
        this.autoMentionGroups.add(groupId);
    }

    disableAutoMention(groupId) {
        this.autoMentionGroups.delete(groupId);
    }

    isAutoMentionEnabled(groupId) {
        return this.autoMentionGroups.has(groupId);
    }
}

module.exports = new SecurityManager();
