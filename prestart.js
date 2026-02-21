/**
 * PRESTART.JS - Limpa sessões anteriores antes de iniciar o bot
 * Evita erros de "Browser already running" e locks de sessão
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

console.log('🧹 ===========================================');
console.log('🧹  MUNIIZ RIFAS BOT - LIMPEZA DE SESSÃO');
console.log('🧹 ===========================================\n');

// Lista de diretórios/arquivos para limpar
const pathsToClean = [
    // Diretórios de autenticação Baileys
    'auth_info',
    'baileys_auth',
    'session',
    'sessions',
    
    // Diretórios Puppeteer/WhatsApp Web JS
    '.wwebjs_auth',
    '.wwebjs_cache',
    
    // Locks e temporários
    path.join(os.tmpdir(), 'puppeteer_dev_chrome_profile-*'),
    path.join(os.tmpdir(), '.org.chromium.Chromium.*'),
    path.join(os.tmpdir(), 'chrome-*'),
    
    // Cache do Chrome
    path.join(os.homedir(), '.config/chromium'),
    path.join(os.homedir(), '.cache/puppeteer'),
    
    // Locks específicos do Railway
    '/app/data/auth/session-muniiz-rifa-bot',
    '/app/data/auth',
    '/tmp/.X11-unix',
    '/tmp/.org.chromium*'
];

// Função para limpar diretório com força total
function forceRemove(targetPath) {
    try {
        // Resolve o caminho absoluto
        const fullPath = path.resolve(targetPath);
        
        // Verifica se existe
        if (!fs.existsSync(fullPath)) {
            return { status: 'not_found', path: targetPath };
        }

        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
            // Tenta remover recursivamente com máxima força
            try {
                fs.rmSync(fullPath, { 
                    recursive: true, 
                    force: true,
                    maxRetries: 3,
                    retryDelay: 100
                });
            } catch (err) {
                // Se falhar, tenta chmod 777 e remove novamente
                try {
                    fs.chmodSync(fullPath, 0o777);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } catch (chmodErr) {
                    // Último recurso: renomeia e marca para deleção posterior
                    const tempName = `${fullPath}.old.${Date.now()}`;
                    fs.renameSync(fullPath, tempName);
                    fs.rmSync(tempName, { recursive: true, force: true });
                }
            }
        } else {
            // Arquivo único
            fs.unlinkSync(fullPath);
        }
        
        return { status: 'removed', path: targetPath };
        
    } catch (error) {
        return { status: 'error', path: targetPath, error: error.message };
    }
}

// Função para limpar processos Chrome/Puppeteer travados
function killChromeProcesses() {
    console.log('🔪 Verificando processos Chrome travados...\n');
    
    try {
        // Linux/Mac
        if (process.platform !== 'win32') {
            try {
                execSync('pkill -f "chrome" || true', { stdio: 'pipe' });
                execSync('pkill -f "chromium" || true', { stdio: 'pipe' });
                execSync('pkill -f "puppeteer" || true', { stdio: 'pipe' });
                console.log('✅ Processos Chrome encerrados\n');
            } catch (e) {
                // Ignora erros se não houver processos
            }
        } else {
            // Windows
            try {
                execSync('taskkill /F /IM chrome.exe /T 2>nul || exit 0', { stdio: 'pipe' });
                execSync('taskkill /F /IM chromium.exe /T 2>nul || exit 0', { stdio: 'pipe' });
            } catch (e) {
                // Ignora erros
            }
        }
    } catch (error) {
        console.log('⚠️ Não foi possível encerrar processos:', error.message);
    }
}

// Função para limpar locks de arquivo
function clearLocks() {
    console.log('🔓 Limpando locks de arquivo...\n');
    
    const lockFiles = [
        'auth_info/.lock',
        'session/.lock',
        '.wwebjs_auth/.lock',
        path.join(os.tmpdir(), '.puppeteer_lock')
    ];
    
    lockFiles.forEach(lockFile => {
        try {
            if (fs.existsSync(lockFile)) {
                fs.unlinkSync(lockFile);
                console.log(`🔓 Lock removido: ${lockFile}`);
            }
        } catch (e) {
            // Ignora erros
        }
    });
}

// Execução principal
console.log('🚀 Iniciando limpeza completa...\n');

// 1. Mata processos travados primeiro
killChromeProcesses();

// 2. Limpa locks
clearLocks();

// 3. Limpa diretórios
console.log('📁 Removendo diretórios de sessão...\n');

let removed = 0;
let errors = 0;
let notFound = 0;

pathsToClean.forEach(item => {
    // Se contém wildcard, usa glob
    if (item.includes('*')) {
        try {
            const dir = path.dirname(item);
            const pattern = path.basename(item);
            
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                const matches = files.filter(f => {
                    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                    return regex.test(f);
                });
                
                matches.forEach(match => {
                    const fullMatchPath = path.join(dir, match);
                    const result = forceRemove(fullMatchPath);
                    if (result.status === 'removed') removed++;
                    else if (result.status === 'error') errors++;
                });
            }
        } catch (e) {
            // Ignora erros de glob
        }
    } else {
        const result = forceRemove(item);
        if (result.status === 'removed') {
            removed++;
            console.log(`✅ Removido: ${item}`);
        } else if (result.status === 'error') {
            errors++;
            console.log(`❌ Erro ao remover ${item}: ${result.error}`);
        } else if (result.status === 'not_found') {
            notFound++;
        }
    }
});

// 4. Recria diretórios necessários limpos
console.log('\n📂 Recriando estrutura limpa...');

const requiredDirs = ['auth_info', 'logs'];
requiredDirs.forEach(dir => {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
            console.log(`📁 Criado: ${dir}/`);
        }
    } catch (e) {
        console.error(`❌ Erro ao criar ${dir}:`, e.message);
    }
});

// 5. Cria arquivo de flag para indicar limpeza
try {
    fs.writeFileSync('.last_clean', new Date().toISOString());
} catch (e) {
    // Ignora
}

// Resumo
console.log('\n✨ ===========================================');
console.log('✨  LIMPEZA CONCLUÍDA');
console.log('✨ ===========================================');
console.log(`📊 Removidos: ${removed} | Ignorados: ${notFound} | Erros: ${errors}`);
console.log('🚀 Iniciando bot...\n');

// Aguarda um pouco para garantir liberação de recursos
setTimeout(() => {
    process.exit(0);
}, 2000);
