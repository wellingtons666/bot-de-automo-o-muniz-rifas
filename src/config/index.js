require('dotenv').config();

module.exports = {
    ADMIN_NUMBER: '5571999465875', // <-- ALTERADO AQUI
    BOT_NAME: process.env.BOT_NAME || 'Bot Menções',
    
    AUTO_MENTION_MIN: 3 * 60 * 1000,
    AUTO_MENTION_MAX: 6 * 60 * 1000,
    
    getAutoMentionInterval() {
        return Math.floor(Math.random() * (this.AUTO_MENTION_MAX - this.AUTO_MENTION_MIN + 1)) + this.AUTO_MENTION_MIN;
    },
    
    BATCH_DELAY: parseInt(process.env.BATCH_DELAY) || 10000,
    MESSAGE_DELAY: parseInt(process.env.MESSAGE_DELAY) || 5000,
    MAX_MENTIONS_PER_HOUR: parseInt(process.env.MAX_MENTIONS_PER_HOUR) || 20,
    COOLDOWN_MINUTES: 0,
    MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE) || 50,
    TRIGGER_COMMAND: 'uau',
    
    MESSAGES: {
        NO_PERMISSION: '⛔ Apenas o administrador pode usar este comando.',
        COOLDOWN_ACTIVE: (time) => `⏳ Aguarde ${time} minutos antes de usar o comando novamente.`,
        MENTION_SENT: (count) => `✅ Menção enviada para ${count} membros!`,
        AUTO_MENTION_ENABLED: '🤖 Menções automáticas ativadas!',
        AUTO_MENTION_DISABLED: '🛑 Menções automáticas desativadas!'
    }
};
