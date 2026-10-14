/* Conversa com o servidor do site (src/index.js). Usado pelo agendamento,
   pela página "Minha conta" e pelo painel do Léo. */
(() => {
  "use strict";

  // O login só fica guardado com cadeado (https). Se a página abriu sem, vai para a versão com.
  if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
  }

  async function chamar(metodo, caminho, dados) {
    let resp;
    try {
      resp = await fetch(caminho, {
        method: metodo,
        credentials: "same-origin",
        headers: dados ? { "Content-Type": "application/json" } : {},
        body: dados ? JSON.stringify(dados) : undefined,
      });
    } catch {
      throw Object.assign(new Error("Sem conexão. Confira sua internet e tente de novo."), { status: 0 });
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw Object.assign(new Error(json.erro || "Algo deu errado. Tente de novo."), { status: resp.status });
    return json;
  }

  const api = {
    get: (c) => chamar("GET", c),
    post: (c, d = {}) => chamar("POST", c, d),
    put: (c, d) => chamar("PUT", c, d),
    del: (c) => chamar("DELETE", c),

    // Cliente logada (ou null). Guardada para não perguntar ao servidor toda hora.
    cliente: null,
    async carregarCliente() {
      try { api.cliente = (await api.get("/api/eu")).cliente; } catch { api.cliente = null; }
      document.dispatchEvent(new CustomEvent("ls:conta", { detail: api.cliente }));
      return api.cliente;
    },
    definirCliente(c) {
      api.cliente = c;
      document.dispatchEvent(new CustomEvent("ls:conta", { detail: c }));
    },
    async sair() {
      await api.post("/api/sair").catch(() => {});
      api.definirCliente(null);
    },
  };

  // Utilidades de formulário usadas nas três páginas.
  api.mascaraTelefone = (input) => input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    input.value = v;
  });
  api.fmtTelefone = (dig) => {
    const d = String(dig || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d;
  };
  api.dadosForm = (form) => Object.fromEntries(new FormData(form).entries());
  api.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  api.fmtData = (iso, opts = { weekday: "long", day: "numeric", month: "long" }) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", opts);
  api.brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  window.LS_API = api;
})();
