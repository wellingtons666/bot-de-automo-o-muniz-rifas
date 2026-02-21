# Bot WhatsApp - Menções Automáticas

Bot para menções automáticas em grupos do WhatsApp, com sistema anti-spam e segurança.

## ⚙️ Configuração

1. Clone o repositório
2. Instale as dependências: `npm install`
3. Configure o `.env` (copie do `.env.example`)
4. Execute: `npm start`

## 🎮 Comandos

- `uau` - Ativa menções manuais e automáticas (apenas admin)

## 🛡️ Segurança

- Apenas o número 5571988140188 pode usar comandos
- Cooldown de 30 minutos entre comandos
- Limite de 3 menções por hora
- Intervalo automático: 2 horas
- Lotes de 50 menções com delay de 10s

## 🚀 Deploy no Railway

1. Crie um projeto no Railway
2. Conecte este repositório
3. Adicione as variáveis de ambiente
4. Deploy!

## ⚠️ Aviso

Use com responsabilidade. Automação de WhatsApp pode violar termos de serviço.
