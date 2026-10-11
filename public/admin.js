(() => {
  "use strict";
  const C = window.LS_CONFIG;
  const API = window.LS_API;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = API.esc;

  let dados = null;      // resposta de /api/admin/agenda
  let clientes = null;

  let tToast;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove("on"), 2600);
  }

  function mostrar(id) {
    ["carregando", "telaLogin", "telaPainel"].forEach((t) => { $(`#${t}`).hidden = t !== id; });
    $("#btnSair").hidden = id !== "telaPainel";
  }

  /* ------------------------------------------------------------ login */
  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, erro = $(".erro", f), btn = $("button", f);
    erro.textContent = ""; btn.disabled = true;
    try {
      await API.post("/api/admin/entrar", { email: f.elements.email.value, senha: f.elements.senha.value });
      f.reset();
      await abrirPainel();
    } catch (err) { erro.textContent = err.message; } finally { btn.disabled = false; }
  });
  $("#btnSair").addEventListener("click", async () => {
    await API.post("/api/admin/sair").catch(() => {});
    mostrar("telaLogin");
  });

  /* ------------------------------------------------------------ abas */
  $$(".abas-painel [data-aba]").forEach((b) => b.addEventListener("click", () => {
    $$(".abas-painel [data-aba]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $$("[data-painel]").forEach((p) => { p.hidden = p.dataset.painel !== b.dataset.aba; });
    if (b.dataset.aba === "clientes") carregarClientes();
  }));

  /* ------------------------------------------------------------ WhatsApp */
  const primeiro = (nome) => nome.trim().split(/\s+/)[0];
  const wa = (num, msg) => `https://wa.me/55${String(num).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}?text=${encodeURIComponent(msg)}`;
  const quando = (a) => `${API.fmtData(a.data)} às ${a.hora}`;
  const msgConfirmado = (a) =>
    `Oi, ${primeiro(a.nome)}! Aqui é o Léo, do L.S Cabeleireiro. Seu horário está confirmado: ${quando(a)} (${a.servicos.join(" + ")}). Te espero!`;
  const msgLembrete = (a) =>
    `Oi, ${primeiro(a.nome)}! Aqui é o Léo. Amanhã você tem um horário comigo: ${quando(a)} (${a.servicos.join(" + ")}). Podemos confirmar? ` +
    `Se preferir, confirme por aqui: ${dados.siteUrl}/confirmar?id=${a.id}&t=${a.token}`;
  // Mensagem do desmarque, de acordo com o motivo escolhido pelo Léo.
  const MOTIVOS = {
    "Imprevisto": (a) => `Infelizmente surgiu um imprevisto e vou precisar desmarcar o seu horário de ${quando(a)}.`,
    "Horário indisponível": (a) => `Infelizmente o horário que você marcou, ${quando(a)}, ficou indisponível e precisei cancelá-lo.`,
    "Incompatibilidade de horário": (a) => `Infelizmente tive uma incompatibilidade na agenda e não vou conseguir te atender ${quando(a)}, por isso precisei cancelar o seu horário.`,
  };
  const msgDesmarcado = (a, motivo) =>
    `Olá, ${primeiro(a.nome)}, tudo bem? Aqui é o Léo, do L.S Cabeleireiro. ` +
    `${(MOTIVOS[motivo] || MOTIVOS["Imprevisto"])(a)} Me desculpe pelo transtorno!\n\n` +
    `Você deseja reagendar agora? É só me responder por aqui ou escolher um novo horário em ${dados.siteUrl}/#agendar`;

  /* ------------------------------------------------------------ agenda */
  async function carregarAgenda() {
    dados = await API.get("/api/admin/agenda");
    $("#avisoEmail").hidden = dados.emailAtivo;
    renderAgenda();
    renderBloqueios();
  }

  function renderAgenda() {
    const ver = $("#verDesmarcados").checked;
    const lista = dados.agendamentos.filter((a) => ver || a.status !== "cancelado");
    const ativos = dados.agendamentos.filter((a) => a.status !== "cancelado");
    const pend = ativos.filter((a) => a.status === "pendente").length;
    const hoje = ativos.filter((a) => a.data === dados.hoje).length;
    $("#resumoAgenda").innerHTML = `
      <div><b>${hoje}</b><span>hoje</span></div>
      <div><b>${ativos.length}</b><span>próximos</span></div>
      <div class="${pend ? "destaque" : ""}"><b>${pend}</b><span>para confirmar</span></div>`;

    const bloqDia = {};
    dados.bloqueios.forEach((b) => (bloqDia[b.data] ||= []).push(b));
    const dias = [...new Set([...lista.map((a) => a.data), ...Object.keys(bloqDia)])].sort();
    if (!dias.length) { $("#agenda").innerHTML = `<p class="vazio">Nenhum horário marcado nos próximos 60 dias.</p>`; return; }

    $("#agenda").innerHTML = dias.map((d) => {
      const rot = d === dados.hoje ? "Hoje · " : "";
      const bl = (bloqDia[d] || []).map((b) =>
        `<p class="faixa-bloqueio">Bloqueado ${b.hora_inicio ? `das ${b.hora_inicio} às ${b.hora_fim}` : "o dia todo"}${b.motivo ? ` · ${esc(b.motivo)}` : ""}</p>`).join("");
      const itens = lista.filter((a) => a.data === d).map(cardAgendamento).join("");
      return `<section class="dia-agenda"><h2>${rot}${esc(API.fmtData(d))}</h2>${bl}${itens}</section>`;
    }).join("");
  }

  const amanha = () => { const d = new Date(`${dados.hoje}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  const eAmanha = (a) => a.data === amanha();

  function cardAgendamento(a) {
    const selos = [
      a.status === "pendente" ? `<span class="selo selo-pendente">Aguardando sua confirmação</span>` : "",
      a.status === "confirmado" ? `<span class="selo selo-confirmado">Confirmado</span>` : "",
      a.status === "cancelado" ? `<span class="selo selo-cancelado">Desmarcado</span>` : "",
      a.cliente_confirmou && a.status !== "cancelado" ? `<span class="selo selo-ok">Cliente confirmou presença</span>` : "",
      a.lembrete_enviado && a.status !== "cancelado" ? `<span class="selo">Lembrete enviado</span>` : "",
    ].join("");
    const ativo = a.status !== "cancelado";
    return `<article class="horario ${a.status}" data-id="${a.id}">
      <div class="horario-quando"><b>${esc(a.hora)}</b><span>≈ ${a.duracao} min</span></div>
      <div class="horario-info">
        <p><b>${esc(a.nome)}</b></p>
        <p>${a.servicos.map(esc).join(" + ")} · a partir de ${esc(API.brl(a.preco))}</p>
        <small><a href="${wa(a.whatsapp, "")}" target="_blank" rel="noopener">${esc(API.fmtTelefone(a.whatsapp))}</a> · ${esc(a.email)}</small>
        ${a.obs ? `<small class="obs">“${esc(a.obs)}”</small>` : ""}
        ${a.status === "cancelado" && a.motivo_cancelado ? `<small class="motivo">${esc(a.motivo_cancelado)}</small>` : ""}
        <div class="selos">${selos}</div>
        ${!ativo ? `<div class="acoes-horario">
          <a class="btn btn-linha btn-sm" target="_blank" rel="noopener" href="${wa(a.whatsapp, msgDesmarcado(a, a.motivo_cancelado))}">Avisar cliente do desmarque</a>
        </div>` : ""}
        ${ativo ? `<div class="acoes-horario">
          ${a.status === "pendente" ? `<button type="button" class="btn btn-escuro btn-sm" data-acao="confirmar">✓ Confirmar horário</button>` : ""}
          ${eAmanha(a) ? `<a class="btn btn-linha btn-sm" target="_blank" rel="noopener" href="${wa(a.whatsapp, msgLembrete(a))}">WhatsApp: lembrete</a>`
            : a.status === "confirmado" ? `<a class="btn btn-linha btn-sm" target="_blank" rel="noopener" href="${wa(a.whatsapp, msgConfirmado(a))}">WhatsApp: confirmação</a>` : ""}
          <button type="button" class="link" data-acao="desmarcar">Desmarcar</button>
        </div>` : ""}
      </div>
    </article>`;
  }

  $("#verDesmarcados").addEventListener("change", renderAgenda);

  $("#agenda").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-acao]");
    if (!b) return;
    const id = Number(b.closest("[data-id]").dataset.id);
    const a = dados.agendamentos.find((x) => x.id === id);
    if (b.dataset.acao === "confirmar") {
      b.disabled = true;
      try {
        const r = await API.post(`/api/admin/agendamentos/${id}/confirmar`);
        Object.assign(a, r.agendamento);
        renderAgenda();
        if (r.emailEnviado) toast(`${primeiro(a.nome)} recebeu a confirmação por e-mail.`);
        else if (confirm(`Horário confirmado. O e-mail automático não está ativo: avisar ${primeiro(a.nome)} pelo WhatsApp agora?`)) open(wa(a.whatsapp, msgConfirmado(a)), "_blank");
      } catch (err) { toast(err.message); b.disabled = false; }
    }
    if (b.dataset.acao === "desmarcar") abrirDesmarcar(a);
  });

  /* ------------------------------------------------------------ desmarcar */
  const jd = $("#janelaDesmarcar"), fd = $("#formDesmarcar");
  let emDesmarque = null;

  const motivoEscolhido = () => fd.elements.motivo.value;
  function abrirDesmarcar(a) {
    emDesmarque = a;
    fd.reset();
    $(".erro", fd).textContent = "";
    $("#quemDesmarcar").textContent = `${a.nome} · ${quando(a)}`;
    fd.elements.mensagem.value = msgDesmarcado(a, motivoEscolhido());
    $("#btnDesmarcar").hidden = false; $("#btnDesmarcar").disabled = false;
    $("#btnAvisarDesmarque").hidden = true;
    $("#btnFecharDesmarcar").textContent = "Voltar";
    fd.querySelectorAll("input[name=motivo]").forEach((r) => { r.disabled = false; });
    jd.showModal();
  }
  // Trocar o motivo refaz a mensagem.
  fd.addEventListener("change", (e) => {
    if (e.target.name === "motivo") fd.elements.mensagem.value = msgDesmarcado(emDesmarque, motivoEscolhido());
  });
  fd.elements.mensagem.addEventListener("input", () => {
    $("#btnAvisarDesmarque").href = wa(emDesmarque.whatsapp, fd.elements.mensagem.value);
  });
  fd.addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "desmarcar") return; // "Voltar" só fecha
    e.preventDefault();
    const a = emDesmarque, btn = $("#btnDesmarcar");
    btn.disabled = true;
    try {
      const r = await API.post(`/api/admin/agendamentos/${a.id}/desmarcar`, { motivo: motivoEscolhido() });
      Object.assign(a, r.agendamento);
      renderAgenda();
      // Depois de desmarcar, o botão vira "Avisar cliente do desmarque" (link direto, sem bloqueio de pop-up).
      btn.hidden = true;
      fd.querySelectorAll("input[name=motivo]").forEach((x) => { x.disabled = true; });
      const avisar = $("#btnAvisarDesmarque");
      avisar.href = wa(a.whatsapp, fd.elements.mensagem.value);
      avisar.hidden = false;
      $("#btnFecharDesmarcar").textContent = "Fechar";
      toast(r.emailEnviado ? `Desmarcado. ${primeiro(a.nome)} também foi avisada por e-mail.` : "Horário desmarcado.");
    } catch (err) { $(".erro", fd).textContent = err.message; btn.disabled = false; }
  });
  $("#btnAvisarDesmarque").addEventListener("click", () => setTimeout(() => jd.close(), 300));

  /* ------------------------------------------------------------ bloqueios */
  const fb = $("#formBloqueio");
  fb.elements.diaTodo.addEventListener("change", () => { $("#horasBloqueio").hidden = fb.elements.diaTodo.checked; });

  fb.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = fb.elements, erro = $(".erro", fb), ok = $(".ok", fb), btn = $("button[type=submit]", fb);
    erro.textContent = ""; ok.textContent = "";
    if (!f.de.value) { erro.textContent = "Escolha o dia."; return; }
    btn.disabled = true;
    try {
      const r = await API.post("/api/admin/bloqueios", {
        de: f.de.value, ate: f.ate.value || f.de.value, motivo: f.motivo.value,
        ...(f.diaTodo.checked ? {} : { horaInicio: f.horaInicio.value, horaFim: f.horaFim.value }),
      });
      fb.reset(); $("#horasBloqueio").hidden = true;
      ok.textContent = r.dias > 1 ? `${r.dias} dias bloqueados.` : "Bloqueado.";
      await carregarAgenda();
      if (r.conflitos.length) {
        alert(`Atenção: ${r.conflitos.length} cliente(s) já tinham horário nesse período. Eles continuam na Agenda: use "Desmarcar" em cada um para avisar.`);
      }
    } catch (err) { erro.textContent = err.message; } finally { btn.disabled = false; }
  });

  function renderBloqueios() {
    const l = dados.bloqueios;
    $("#listaBloqueios").innerHTML = l.length ? l.map((b) => `
      <div class="item-bloqueio">
        <div><b>${esc(API.fmtData(b.data))}</b>
          <small>${b.hora_inicio ? `das ${b.hora_inicio} às ${b.hora_fim}` : "dia todo"}${b.motivo ? ` · ${esc(b.motivo)}` : ""}</small></div>
        <button type="button" class="link" data-remover="${b.id}">Liberar</button>
      </div>`).join("") : `<p class="vazio">Nenhum dia bloqueado.</p>`;
  }

  $("#listaBloqueios").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-remover]");
    if (!b) return;
    b.disabled = true;
    try { await API.del(`/api/admin/bloqueios/${b.dataset.remover}`); await carregarAgenda(); toast("Dia liberado para agendamento."); }
    catch (err) { toast(err.message); b.disabled = false; }
  });

  /* ------------------------------------------------------------ clientes */
  async function carregarClientes() {
    try { clientes = (await API.get("/api/admin/clientes")).clientes; renderClientes(); }
    catch (err) { $("#listaClientes").innerHTML = `<p class="erro">${esc(err.message)}</p>`; }
  }
  function renderClientes() {
    const q = $("#buscaCliente").value.trim().toLowerCase();
    const l = clientes.filter((c) => !q || `${c.nome} ${c.email} ${c.whatsapp}`.toLowerCase().includes(q.replace(/[()\s-]/g, "")) || c.nome.toLowerCase().includes(q));
    $("#totalClientes").textContent = `(${clientes.length})`;
    $("#listaClientes").innerHTML = l.length ? l.map((c) => {
      const end = [c.rua && `${c.rua}, ${c.numero}`, c.complemento, c.bairro, c.cidade && `${c.cidade}/${c.uf}`, c.cep].filter(Boolean).join(" · ");
      return `<div class="item-cliente">
        <b>${esc(c.nome)}</b>
        <small><a href="${wa(c.whatsapp, "")}" target="_blank" rel="noopener">${esc(API.fmtTelefone(c.whatsapp))}</a> · ${esc(c.email)}</small>
        <small>${end ? esc(end) : "Sem endereço cadastrado"} · ${c.total} horário(s)</small>
      </div>`;
    }).join("") : `<p class="vazio">Nenhuma cliente encontrada.</p>`;
  }
  $("#buscaCliente").addEventListener("input", () => clientes && renderClientes());

  /* ------------------------------------------------------------ início */
  async function abrirPainel() {
    await carregarAgenda();
    mostrar("telaPainel");
  }
  abrirPainel().catch((err) => {
    mostrar("telaLogin");
    if (err.status !== 401) $("#formLogin .erro").textContent = err.message;
  });
  // Atualiza sozinho a cada 2 minutos, para novos agendamentos aparecerem.
  setInterval(() => { if (!$("#telaPainel").hidden) carregarAgenda().catch(() => {}); }, 120000);
})();
