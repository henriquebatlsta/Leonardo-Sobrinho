# leonardosobrinho.com

Site de agendamento do L.S Cabeleireiro (Leonardo Sobrinho), na Cloudflare (Worker `small-voice-493b`).

## O que tem

- **Site** (`public/index.html`): catálogo, escolha de dia e horário, e cadastro/login da cliente para reservar.
- **Minha conta** (`/conta.html`): a cliente vê e cancela os horários, edita os dados e o endereço (já pronto para a futura loja) e troca a senha.
- **Painel do Léo** (`/admin.html`): confirma horários (a cliente recebe e-mail), desmarca, bloqueia dias ou trechos do dia e vê as clientes cadastradas.
- **Lembrete automático**: um dia antes, a partir das 9h, a cliente recebe um e-mail "amanhã você tem horário comigo, podemos confirmar?" com um botão para confirmar presença.

## Arquivos

- `public/`: as páginas. `public/config.js` tem e-mail, WhatsApp, horários, serviços e preços (vale para o site e para o servidor).
- `src/`: o servidor (Worker): login, agendamentos, painel e lembretes.
- `migrations/`: estrutura do banco de dados D1 (`leonardo-sobrinho-db`).
- `wrangler.jsonc`: configuração da Cloudflare.

## Configuração na Cloudflare (uma vez)

1. **Senha do painel:** Worker `small-voice-493b` → Settings → Variables and Secrets → adicionar **Secret** `ADMIN_PASSWORD`.
2. **Envio de e-mails:** Email Service → Email Sending → ativar o domínio `leonardosobrinho.com` (exige o plano Workers Paid). Os e-mails saem de `agenda@leonardosobrinho.com`. Sem isso o site funciona, e o painel oferece botões de WhatsApp no lugar.
3. **Publicação automática:** Worker → Settings → Build → conectar o repositório, branch `main`, comando de deploy `npm run deploy` (aplica o banco e publica).

## Testar no computador

```sh
npm install
printf 'ADMIN_PASSWORD=teste\nSITE_URL=http://localhost:8787\n' > .dev.vars
npm run db:local
npm run dev
```
