const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 ===========================================');
console.log('🧹  MUNIIZ RIFAS - LIMPEZA DE SESSÃO');
console.log('🧹 ===========================================\n');

const pathsToClean = [
    'auth_info',
    'baileys_auth',
    'session',
    'sessions',
    '.wwebjs_auth',
    '.wwebjs_cache'
];

pathsToClean.forEach(item => {
    try {
        const fullPath = path.resolve(item);
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`✅ Removido: ${item}`);
        }
    } catch (e) {
        console.log(`⚠️ Erro ao remover ${item}: ${e.message}`);
    }
});

try {
    execSync('pkill -f "chrome" 2>/dev/null || true');
    execSync('pkill -f "chromium" 2>/dev/null || true');
} catch (e) {}

try {
    fs.mkdirSync('auth_info', { recursive: true });
    fs.mkdirSync('logs', { recursive: true });
} catch (e) {}

console.log('\n✨ Limpeza concluída!\n');

setTimeout(() => {
    process.exit(0);
}, 1000);
