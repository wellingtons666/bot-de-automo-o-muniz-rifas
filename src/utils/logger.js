const pino = require('pino');

const logger = pino({ 
    level: 'silent'  // Silencioso para produção
});

module.exports = logger;
