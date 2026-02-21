const pino = require('pino');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info'
});

// Compatibilidade com .child()
logger.child = function() { return this; };

module.exports = logger;
