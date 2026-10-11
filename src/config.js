// O public/config.js foi escrito para o navegador (window.LS_CONFIG).
// Este módulo deixa o mesmo arquivo valer também no servidor, para que
// serviços, preços e horários fiquem num lugar só.
import "./shim.js";
import "../public/config.js";

export const C = globalThis.window.LS_CONFIG;
