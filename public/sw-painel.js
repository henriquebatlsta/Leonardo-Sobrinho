// Service worker mínimo do painel: só existe para o Chrome do Android oferecer
// "Instalar app". Não guarda nada em cache; tudo vai direto para a internet.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
