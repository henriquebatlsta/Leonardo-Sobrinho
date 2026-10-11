# leonardosobrinho.com

Site de agendamento do L.S Cabeleireiro (Leonardo Sobrinho).

- `public/`: o site (HTML, CSS, JS e imagens).
- `public/config.js`: e-mail, WhatsApp, horários, serviços e preços. Quase toda alteração é só aqui.
- `wrangler.jsonc`: configuração da Cloudflare (Worker `small-voice-493b`). Cada alteração enviada para a branch `main` publica o site automaticamente.
