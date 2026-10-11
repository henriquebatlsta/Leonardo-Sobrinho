# Leonardo-Sobrinho

Site de agendamento do L.S Cabeleireiro, servido pela Cloudflare (Worker `small-voice-493b`, domínio leonardosobrinho.com).

- Páginas em `public/`; servidor (Worker) em `src/` só para `/api/*` e `/confirmar`, mais o cron de lembretes. Dados do salão (e-mail, WhatsApp, horários, serviços, preços) ficam em `public/config.js`, que o servidor também importa.
- Banco D1 `leonardo-sobrinho-db` (binding `DB`). Mudança de estrutura = nova migração em `migrations/`; nunca editar uma migração já aplicada.
- Regras de horário existem em dois lugares e precisam ficar iguais: `public/app.js` (`horariosDoDia`) e `src/agenda.js` (`motivoIndisponivel`).
- Datas são AAAA-MM-DD no horário de Brasília (UTC-3).
- When interacting with Cloudflare, use the `cf` CLI unless the project has a Wrangler configuration file. Este projeto tem `wrangler.jsonc`, então use Wrangler aqui.
- A publicação acontece pela integração Git da Cloudflare a partir da branch `main`.
