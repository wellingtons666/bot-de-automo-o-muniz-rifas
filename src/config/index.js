require('dotenv').config();

module.exports = {
    // Admin principal (seu número)
    ADMIN_NUMBER: process.env.ADMIN_NUMBER || '5571988140188',
    
    // Nome do bot
    BOT_NAME: process.env.BOT_NAME || 'Bot Menções',
    
    // Intervalos (ms)
    AUTO_MENTION_MIN: 3 * 60 * 1000, // 3 minutos
    AUTO_MENTION_MAX: 6 * 60 * 1000, // 6 minutos
    BATCH_DELAY: parseInt(process.env.BATCH_DELAY) || 10000, // 10 segundos entre lotes
    MESSAGE_DELAY: parseInt(process.env.MESSAGE_DELAY) || 5000, // 5 segundos entre mensagens
    
    // Limites de segurança anti-spam (apenas para automático)
    MAX_MENTIONS_PER_HOUR: parseInt(process.env.MAX_MENTIONS_PER_HOUR) || 20, // Aumentado para automático
    COOLDOWN_MINUTES: 0, // Sem cooldown para manual
    MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE) || 50,
    
    // Comando de ativação
    TRIGGER_COMMAND: 'uau',
    
    // Mensagens
    MESSAGES: {
        NO_PERMISSION: '⛔ Apenas o administrador pode usar este comando.',
        COOLDOWN_ACTIVE: (time) => `⏳ Aguarde ${time} minutos antes de usar o comando novamente.`,
        MENTION_SENT: (count) => `✅ Menção enviada para ${count} membros!`,
        AUTO_MENTION_ENABLED: '🤖 Menções automáticas ativadas!',
        AUTO_MENTION_DISABLED: '🛑 Menções automáticas desativadas!'
    }
};
