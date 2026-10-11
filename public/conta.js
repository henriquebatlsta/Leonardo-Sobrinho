(() => {
  "use strict";
  const C = window.LS_CONFIG;
  const API = window.LS_API;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = API.esc;

  $("#ano").textContent = new Date().getFullYear();

  let tToast;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove("on"), 2200);
  }

  function mostrar(id) {
    ["carregando", "telaEntrar", "telaEsqueci", "telaRedefinir", "telaConta"].forEach((t) => { $(`#${t}`).hidden = t !== id; });
    const foco = $(`#${id} h1`);
    if (foco) { foco.setAttribute("tabindex", "-1"); foco.focus({ preventScroll: true }); }
  }

  // Envia um formulário mostrando erro/sucesso nele mesmo.
  async function enviarForm(form, acao) {
    const btn = $("button[type=submit]", form);
    const erro = $(".erro", form), ok = $(".ok", form);
    erro.textContent = ""; if (ok) ok.textContent = "";
    btn.disabled = true;
    try { await acao(); } catch (e) { erro.textContent = e.message; } finally { btn.disabled = false; }
  }

  /* ------------------------------------------------------------ entrar / cadastrar */
  const fe = $("#formEntrar");
  let modo = "entrar";
  API.mascaraTelefone(fe.elements.whatsapp);
  $$("#telaEntrar [data-modo]").forEach((b) => b.addEventListener("click", () => {
    modo = b.dataset.modo;
    $$("#telaEntrar [data-modo]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $$("[data-so]", fe).forEach((el) => { el.hidden = el.dataset.so !== modo; });
    fe.elements.senha.autocomplete = modo === "cadastro" ? "new-password" : "current-password";
    $("#btnEntrar").textContent = modo === "cadastro" ? "Criar minha conta" : "Entrar";
    $(".erro", fe).textContent = "";
  }));
  fe.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarForm(fe, async () => {
      const d = API.dadosForm(fe);
      const r = modo === "cadastro"
        ? await API.post("/api/cadastro", d)
        : await API.post("/api/entrar", { email: d.email, senha: d.senha });
      fe.reset();
      API.definirCliente(r.cliente);
      abrirConta();
      if (modo === "cadastro") toast("Conta criada! Complete seu endereço quando quiser.");
    });
  });

  /* ------------------------------------------------------------ senha */
  const fq = $("#formEsqueci");
  fq.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarForm(fq, async () => {
      const r = await API.post("/api/senha/esqueci", { email: fq.elements.email.value });
      $(".ok", fq).textContent = r.emailAtivo
        ? "Pronto! Se esse e-mail tiver conta, o link chega em instantes. Confira também o spam."
        : "O envio de e-mails ainda não está ativo. Chame o Léo no WhatsApp para trocar sua senha.";
    });
  });
  const fr = $("#formRedefinir");
  fr.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarForm(fr, async () => {
      const token = (location.hash.match(/redefinir=([a-f0-9]+)/) || [])[1];
      await API.post("/api/senha/redefinir", { token, senha: fr.elements.senha.value });
      history.replaceState(null, "", location.pathname);
      await API.carregarCliente();
      toast("Senha alterada!");
      abrirConta();
    });
  });

  /* ------------------------------------------------------------ conta logada */
  const fd = $("#formDadosConta");
  API.mascaraTelefone(fd.elements.whatsapp);

  function preencherDados(c) {
    $("#olaNome").textContent = c.nome.split(" ")[0];
    const f = fd.elements;
    f.nome.value = c.nome; f.email.value = c.email; f.whatsapp.value = API.fmtTelefone(c.whatsapp);
    ["rua", "numero", "complemento", "bairro", "cidade", "uf"].forEach((k) => { f[k].value = c[k] || ""; });
    f.cep.value = c.cep ? c.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2") : "";
  }

  // CEP preenche rua, bairro, cidade e UF (ViaCEP, serviço público e gratuito).
  fd.elements.cep.addEventListener("input", async (e) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 8);
    e.target.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    if (d.length !== 8) return;
    try {
      const r = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
      if (r.erro) return;
      const f = fd.elements;
      f.rua.value = r.logradouro || f.rua.value;
      f.bairro.value = r.bairro || f.bairro.value;
      f.cidade.value = r.localidade || f.cidade.value;
      f.uf.value = r.uf || f.uf.value;
      f.numero.focus();
    } catch { /* sem internet: a cliente digita */ }
  });

  fd.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarForm(fd, async () => {
      const d = API.dadosForm(fd);
      if (!d.novaSenha) { delete d.novaSenha; delete d.senhaAtual; }
      const r = await API.put("/api/eu", d);
      API.definirCliente(r.cliente);
      preencherDados(r.cliente);
      fd.elements.senhaAtual.value = ""; fd.elements.novaSenha.value = "";
      $(".ok", fd).textContent = "Dados salvos!";
    });
  });

  $("#btnSair").addEventListener("click", async () => {
    await API.sair();
    mostrar("telaEntrar");
  });

  const STATUS = {
    pendente: ["Aguardando o Léo confirmar", "pendente"],
    confirmado: ["Confirmado pelo Léo", "confirmado"],
    cancelado: ["Desmarcado", "cancelado"],
  };

  async function carregarHorarios() {
    const lista = $("#listaHorarios");
    try {
      const { agendamentos, hoje } = await API.get("/api/agendamentos/meus");
      if (!agendamentos.length) { lista.innerHTML = `<p class="vazio">Você ainda não tem horários marcados.</p>`; return; }
      const futuros = agendamentos.filter((a) => a.data >= hoje).reverse();
      const passados = agendamentos.filter((a) => a.data < hoje);
      const card = (a, futuro) => {
        const [rot, cls] = STATUS[a.status] || [a.status, ""];
        const presenca = a.cliente_confirmou && a.status !== "cancelado" ? `<span class="selo selo-ok">Você confirmou presença</span>` : "";
        return `<article class="horario ${cls}">
          <div class="horario-quando"><b>${esc(API.fmtData(a.data))}</b><span>${esc(a.hora)}</span></div>
          <div class="horario-info">
            <p>${a.servicos.map(esc).join(" + ")}</p>
            <small>a partir de ${esc(API.brl(a.preco))}</small>
            <div class="selos"><span class="selo selo-${cls}">${esc(rot)}</span>${presenca}</div>
            ${a.status === "cancelado" && a.motivo_cancelado ? `<small class="motivo">${esc(a.motivo_cancelado)}</small>` : ""}
          </div>
          ${futuro && a.status !== "cancelado" ? `<button type="button" class="link" data-cancelar="${a.id}">Cancelar</button>` : ""}
        </article>`;
      };
      lista.innerHTML =
        (futuros.length ? futuros.map((a) => card(a, true)).join("") : `<p class="vazio">Nenhum horário futuro.</p>`) +
        (passados.length ? `<details class="passados"><summary>Horários anteriores (${passados.length})</summary>${passados.map((a) => card(a, false)).join("")}</details>` : "");
    } catch (e) {
      lista.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
    }
  }

  $("#listaHorarios").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cancelar]");
    if (!b) return;
    if (!confirm("Cancelar este horário? O Léo vai ser avisado.")) return;
    b.disabled = true;
    try {
      await API.post(`/api/agendamentos/${b.dataset.cancelar}/cancelar`);
      toast("Horário cancelado.");
      carregarHorarios();
    } catch (err) { toast(err.message); b.disabled = false; }
  });

  function abrirConta() {
    preencherDados(API.cliente);
    mostrar("telaConta");
    carregarHorarios();
  }

  /* ------------------------------------------------------------ início */
  async function rotear() {
    if (/redefinir=/.test(location.hash)) return mostrar("telaRedefinir");
    if (location.hash === "#esqueci") return mostrar("telaEsqueci");
    if (API.cliente) return abrirConta();
    mostrar("telaEntrar");
  }
  addEventListener("hashchange", rotear);
  API.carregarCliente().then(rotear);
})();
