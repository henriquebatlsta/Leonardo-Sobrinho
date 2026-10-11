# Leonardo-Sobrinho

Site de agendamento do L.S Cabeleireiro, servido pela Cloudflare (Worker `small-voice-493b`, domínio leonardosobrinho.com).

- O site é estático: tudo fica em `public/`. Dados do salão (e-mail, WhatsApp, horários, serviços, preços) ficam em `public/config.js`.
- When interacting with Cloudflare, use the `cf` CLI unless the project has a Wrangler configuration file. Este projeto tem `wrangler.jsonc`, então use Wrangler aqui.
- A publicação acontece pela integração Git da Cloudflare a partir da branch `main`.
