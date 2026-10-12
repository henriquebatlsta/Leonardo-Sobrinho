(() => {
  "use strict";
  const C = window.LS_CONFIG;
  const API = window.LS_API;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const porId = Object.fromEntries(C.servicos.map((s) => [s.id, s]));
  const nomeServico = (s) => s.nome + (s.nota ? ` (${s.nota})` : "");

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
  };

  const estado = {
    sel: (store.get("ls-sel") || []).filter((id) => porId[id]),
    dia: null,     // Date (00:00)
    hora: null,    // "HH:MM"
    passo: 1,
    aba: "todos",
    modoConta: "cadastro",
    // Horários já marcados e bloqueios do Léo, por dia ("AAAA-MM-DD").
    ocupados: {},
    bloqueios: {},
  };

  /* ------------------------------------------------------------ splash */
  (function splash() {
    const el = $("#splash");
    const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visto = false;
    try { visto = sessionStorage.getItem("ls-splash") === "1"; } catch { /* ok */ }
    if (reduz || visto) { el.classList.add("desligado"); return; }
    try { sessionStorage.setItem("ls-splash", "1"); } catch { /* ok */ }
    const video = $("video", el);
    const sai = () => { el.classList.add("fora"); setTimeout(() => el.classList.add("desligado"), 700); };
    video.addEventListener("ended", () => setTimeout(sai, 250));
    video.addEventListener("error", sai);
    el.addEventListener("click", sai);
    video.play().catch(sai);
    setTimeout(sai, 4200);
  })();

  /* ------------------------------------------------------------ tempo */
  const paraMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const paraHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const mesmoDia = (a, b) => a && b && a.toDateString() === b.toDateString();
  const fmtDur = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
  };
  const fmtDiaLongo = (d) => d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const duracaoTotal = () => estado.sel.reduce((t, id) => t + porId[id].duracao, 0);
  const precoTotal = () => estado.sel.reduce((t, id) => t + porId[id].preco, 0);

  const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sobrepoe = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
  const diaBloqueado = (d) => (estado.bloqueios[chaveDia(d)] || []).some((b) => !b.hora_inicio);

  async function carregarDisponibilidade() {
    try {
      const r = await API.get("/api/disponibilidade");
      estado.ocupados = {}; estado.bloqueios = {};
      r.ocupados.forEach((o) => (estado.ocupados[o.data] ||= []).push(o));
      r.bloqueios.forEach((b) => (estado.bloqueios[b.data] ||= []).push(b));
    } catch { /* sem servidor: mostra o expediente normal; o servidor confere na hora de marcar */ }
    if (estado.dia && estado.hora && !horariosDoDia(estado.dia).includes(estado.hora)) estado.hora = null;
    renderDias(); renderHorarios(); renderRodape();
  }

  function horariosDoDia(d) {
    const exp = C.horarios[d.getDay()];
    if (!exp || diaBloqueado(d)) return [];
    const ocupados = (estado.ocupados[chaveDia(d)] || []).map((o) => [paraMin(o.hora), paraMin(o.hora) + Math.max(o.duracao, C.intervaloMinutos)]);
    const bloqueios = (estado.bloqueios[chaveDia(d)] || []).map((b) => [paraMin(b.hora_inicio), paraMin(b.hora_fim)]);
    const dur = Math.max(duracaoTotal(), C.intervaloMinutos);
    const abre = paraMin(exp.abre), fecha = paraMin(exp.fecha);
    const ultimo = exp.ultimoHorario ? paraMin(exp.ultimoHorario) : fecha;
    let minimo = -1;
    if (mesmoDia(d, new Date())) {
      const agora = new Date();
      minimo = agora.getHours() * 60 + agora.getMinutes() + C.antecedenciaMinimaHoras * 60;
    }
    const pausas = (C.pausas || []).map((p) => [paraMin(p.inicio), paraMin(p.fim)]);
    const out = [];
    for (let t = abre; t <= ultimo && t + dur <= fecha; t += C.intervaloMinutos) {
      if (t < minimo) continue;
      if (pausas.some(([i, f]) => t >= i && t < f)) continue; // não começa durante a pausa
      if ([...ocupados, ...bloqueios].some(([i, f]) => sobrepoe(t, t + dur, i, f))) continue;
      out.push(paraHHMM(t));
    }
    return out;
  }

  /* ------------------------------------------------------------ catálogo */
  function renderAbas() {
    const abas = [{ id: "todos", nome: "Todos" }, ...C.categorias];
    $("#abas").innerHTML = abas.map((a) =>
      `<button class="aba" role="tab" data-aba="${a.id}" aria-selected="${a.id === estado.aba}">${a.nome}</button>`
    ).join("");
  }

  function cardServico(s) {
    const sel = estado.sel.includes(s.id);
    return `
      <article class="servico${sel ? " sel" : ""}" data-id="${s.id}">
        <h3>${s.nome}${s.nota ? ` <span class="nota">(${s.nota})</span>` : ""}</h3>
        <p>${s.desc}</p>
        <div class="servico-pe">
          <div class="preco"><small>a partir de</small><b>${brl(s.preco)}</b></div>
          <button type="button" class="btn-add" data-toggle="${s.id}" aria-pressed="${sel}"
            aria-label="${sel ? "Remover" : "Adicionar"} ${nomeServico(s)}">${sel ? "✓ Adicionado" : "+ Adicionar"}</button>
        </div>
        <span class="dur">≈ ${fmtDur(s.duracao)}</span>
      </article>`;
  }

  function renderCatalogo() {
    const cats = estado.aba === "todos" ? C.categorias : C.categorias.filter((c) => c.id === estado.aba);
    $("#gradeServicos").innerHTML = cats.map((c) =>
      (estado.aba === "todos" ? `<h3 class="cat-titulo">${c.nome}</h3>` : "") +
      C.servicos.filter((s) => s.cat === c.id).map(cardServico).join("")
    ).join("");
  }

  $("#abas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-aba]");
    if (!b) return;
    estado.aba = b.dataset.aba;
    renderAbas(); renderCatalogo();
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) alternar(t.dataset.toggle);
    const r = e.target.closest("[data-remove]");
    if (r) alternar(r.dataset.remove);
  });

  function alternar(id) {
    const i = estado.sel.indexOf(id);
    if (i >= 0) estado.sel.splice(i, 1);
    else { estado.sel.push(id); toast(`${nomeServico(porId[id])} adicionado`); }
    store.set("ls-sel", estado.sel);
    // a duração mudou: o horário escolhido pode não caber mais
    if (estado.dia && estado.hora && !horariosDoDia(estado.dia).includes(estado.hora)) estado.hora = null;
    atualizarTudo();
  }

  /* ------------------------------------------------------------ agendamento */
  function renderSelecao() {
    const vazio = estado.sel.length === 0;
    $("#selecaoVazia").hidden = !vazio;
    $("#listaSelecao").innerHTML = estado.sel.map((id) => {
      const s = porId[id];
      return `<div class="item-sel">
        <div><b>${nomeServico(s)}</b><small>≈ ${fmtDur(s.duracao)}</small></div>
        <span class="preco-item">${brl(s.preco)}</span>
        <button type="button" class="btn-x" data-remove="${id}" aria-label="Remover ${nomeServico(s)}">×</button>
      </div>`;
    }).join("");
    $("#addRapido").innerHTML = C.servicos.filter((s) => !estado.sel.includes(s.id))
      .map((s) => `<button type="button" class="chip" data-toggle="${s.id}">+ ${nomeServico(s)}</button>`).join("");
  }

  function renderDias() {
    const base = hoje0();
    const dias = [];
    for (let i = 0; i < C.diasParaFrente; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      dias.push(d);
    }
    const ref = estado.dia || dias.find((d) => horariosDoDia(d).length) || base;
    const mes = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    $("#mesLabel").textContent = mes;
    $("#dias").innerHTML = dias.map((d, i) => {
      const livre = horariosDoDia(d).length > 0;
      const fechado = !C.horarios[d.getDay()] || diaBloqueado(d);
      const sem = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
      const rot = i === 0 ? "hoje" : i === 1 ? "amanhã" : d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      return `<button type="button" class="dia" role="option" data-dia="${d.toISOString()}"
        aria-selected="${mesmoDia(d, estado.dia)}" ${livre ? "" : "disabled"}
        aria-label="${fmtDiaLongo(d)}${fechado ? ", fechado" : livre ? "" : ", sem horários"}">
        <small>${sem}</small><b>${d.getDate()}</b><span>${fechado ? "fechado" : rot}</span></button>`;
    }).join("");
  }

  $("#dias").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dia]");
    if (!b || b.disabled) return;
    estado.dia = new Date(b.dataset.dia);
    estado.hora = null;
    irPara(3);
  });

  function renderHorarios() {
    if (!estado.dia) return;
    $("#diaEscolhido").textContent = `${fmtDiaLongo(estado.dia)} · duração estimada ${fmtDur(Math.max(duracaoTotal(), C.intervaloMinutos))}`;
    const hs = horariosDoDia(estado.dia);
    if (!hs.length) {
      $("#horarios").innerHTML = `<p class="vazio">Não há horários livres para essa combinação neste dia. Tente outra data.</p>`;
      return;
    }
    const grupos = [["Manhã", (m) => m < 720], ["Tarde", (m) => m >= 720 && m < 1080], ["Noite", (m) => m >= 1080]];
    $("#horarios").innerHTML = grupos.map(([nome, f]) => {
      const lista = hs.filter((h) => f(paraMin(h)));
      if (!lista.length) return "";
      return `<div class="periodo"><h4>${nome}</h4><div class="slots">${lista.map((h) =>
        `<button type="button" class="slot" data-hora="${h}" aria-pressed="${h === estado.hora}">${h}</button>`).join("")}</div></div>`;
    }).join("");
  }

  $("#horarios").addEventListener("click", (e) => {
    const b = e.target.closest("[data-hora]");
    if (!b) return;
    estado.hora = b.dataset.hora;
    renderHorarios();
    renderRodape();
  });

  function renderPassos() {
    $$("#passos li").forEach((li) => {
      const p = +li.dataset.p;
      li.classList.toggle("atual", p === estado.passo);
      li.classList.toggle("feito", p < estado.passo);
    });
    $$(".passo").forEach((el) => { el.hidden = +el.dataset.passo !== estado.passo; });
    const final = estado.passo === 5;
    $("#passos").hidden = final;
    $("#cartaoRodape").hidden = final;
  }

  function podeAvancar() {
    if (estado.passo === 1) return estado.sel.length > 0;
    if (estado.passo === 2) return !!estado.dia;
    if (estado.passo === 3) return !!estado.hora;
    return true;
  }

  function renderRodape() {
    const n = estado.sel.length;
    $("#totalPreco").textContent = n ? `a partir de ${brl(precoTotal())}` : "—";
    $("#totalDuracao").textContent = n
      ? `${n} serviço${n > 1 ? "s" : ""} · ≈ ${fmtDur(duracaoTotal())}${estado.dia && estado.hora && estado.passo >= 3 ? ` · ${estado.dia.toLocaleDateString("pt-BR")} às ${estado.hora}` : ""}`
      : "Escolha ao menos um serviço";
    $("#btnVoltar").style.visibility = estado.passo > 1 ? "visible" : "hidden";
    const av = $("#btnAvancar");
    av.textContent = estado.passo === 4 ? (API.cliente || estado.modoConta === "entrar" ? "Confirmar agendamento" : "Criar conta e agendar") : "Continuar";
    av.disabled = !podeAvancar();
  }

  function renderBarra() {
    const n = estado.sel.length;
    $("#barraQtd").textContent = `${n} serviço${n > 1 ? "s" : ""}`;
    $("#barraPreco").textContent = `a partir de ${brl(precoTotal())} · ≈ ${fmtDur(duracaoTotal())}`;
    $("#barraSelecao").hidden = n === 0 || agendaVisivel;
  }

  function atualizarTudo() {
    renderCatalogo(); renderSelecao(); renderDias(); renderHorarios(); renderPassos(); renderRodape(); renderBarra();
  }

  function irPara(p) {
    if (p === 2 && estado.passo !== 2) carregarDisponibilidade();
    estado.passo = p;
    renderPassos(); renderDias(); renderHorarios(); renderRodape();
    const topoCartao = $("#cartaoAgenda").getBoundingClientRect().top;
    if (topoCartao < 0 || topoCartao > innerHeight * 0.6) $("#cartaoAgenda").scrollIntoView({ behavior: "smooth", block: "start" });
    const foco = $(`.passo[data-passo="${p}"] h3`);
    if (foco) { foco.setAttribute("tabindex", "-1"); foco.focus({ preventScroll: true }); }
  }

  $("#btnVoltar").addEventListener("click", () => irPara(Math.max(1, estado.passo - 1)));
  $("#btnAvancar").addEventListener("click", () => {
    if (estado.passo < 4) { if (podeAvancar()) irPara(estado.passo + 1); return; }
    enviar();
  });
  $("#barraBtn").addEventListener("click", (e) => {
    e.preventDefault();
    $("#agendar").scrollIntoView({ behavior: "smooth" });
    if (estado.passo === 1) irPara(2);
  });

  // a barra flutuante some quando o agendamento já está na tela
  let agendaVisivel = false;
  new IntersectionObserver(([en]) => { agendaVisivel = en.isIntersecting; renderBarra(); }, { threshold: 0.15 })
    .observe($("#agendar"));

  /* ------------------------------------------------------------ conta (passo 4) */
  const formConta = $("#formConta");
  API.mascaraTelefone(formConta.elements.whatsapp);

  function renderConta() {
    const c = API.cliente;
    $("#comConta").hidden = !c;
    $("#semConta").hidden = !!c;
    if (c) {
      $("#quemNome").textContent = c.nome;
      $("#quemContato").textContent = `${c.email} · ${API.fmtTelefone(c.whatsapp)}`;
      const obsAntiga = formConta.elements.obs.value.trim();
      if (obsAntiga && !$("#obs").value) $("#obs").value = obsAntiga;
    }
    const cad = estado.modoConta === "cadastro";
    $$(".abas-conta [data-modo]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.modo === estado.modoConta)));
    $$("[data-so]", formConta).forEach((el) => { el.hidden = el.dataset.so !== estado.modoConta; });
    formConta.elements.senha.autocomplete = cad ? "new-password" : "current-password";
    // O painel do Léo não aparece no menu público: ele entra direto em /admin.html.
    $("#linkConta").textContent = c ? "Minha conta" : "Entrar";
  }

  $$(".abas-conta [data-modo]").forEach((b) => b.addEventListener("click", () => {
    estado.modoConta = b.dataset.modo;
    $("#erroForm").textContent = "";
    renderConta();
  }));
  $("#btnTrocarConta").addEventListener("click", async () => {
    await API.sair();
    estado.modoConta = "entrar";
    renderConta(); renderRodape();
  });
  formConta.addEventListener("submit", (e) => { e.preventDefault(); enviar(); });
  formConta.addEventListener("input", (e) => { e.target.removeAttribute("aria-invalid"); $("#erroForm").textContent = ""; });
  document.addEventListener("ls:conta", () => { renderConta(); renderRodape(); });

  function validarConta() {
    const f = formConta.elements;
    const cad = estado.modoConta === "cadastro";
    const erros = [];
    if (cad && f.nome.value.trim().length < 3) erros.push([f.nome, "Informe seu nome."]);
    if (cad && f.whatsapp.value.replace(/\D/g, "").length < 10) erros.push([f.whatsapp, "Informe um WhatsApp com DDD."]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) erros.push([f.email, "Informe seu e-mail."]);
    if (f.senha.value.length < (cad ? 6 : 1)) erros.push([f.senha, cad ? "A senha precisa ter pelo menos 6 caracteres." : "Informe sua senha."]);
    erros.forEach(([el]) => el.setAttribute("aria-invalid", "true"));
    if (erros.length) { $("#erroForm").textContent = erros[0][1]; erros[0][0].focus(); }
    return !erros.length;
  }

  async function garantirConta() {
    if (API.cliente) return true;
    if (!validarConta()) return false;
    const f = formConta.elements;
    const dados = estado.modoConta === "cadastro"
      ? { nome: f.nome.value, whatsapp: f.whatsapp.value, email: f.email.value, senha: f.senha.value }
      : { email: f.email.value, senha: f.senha.value };
    const r = await API.post(estado.modoConta === "cadastro" ? "/api/cadastro" : "/api/entrar", dados);
    $("#obs").value = f.obs.value;
    formConta.reset();
    API.definirCliente(r.cliente);
    return true;
  }

  let ultimo = null;

  async function enviar() {
    const btn = $("#btnAvancar");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      if (!(await garantirConta())) { renderRodape(); return; }
      const r = await API.post("/api/agendamentos", {
        servicos: estado.sel, data: chaveDia(estado.dia), hora: estado.hora, obs: $("#obs").value.trim(),
      });
      const a = r.agendamento;
      const dados = {
        nome: a.nome, whatsapp: API.fmtTelefone(a.whatsapp), email: a.email, obs: a.obs,
        dia: new Date(estado.dia), hora: a.hora,
        servicos: estado.sel.map((id) => porId[id]), duracao: a.duracao, preco: a.preco,
      };
      avisarLeo(dados);
      ultimo = dados;
      mostrarSucesso(dados);
    } catch (err) {
      $("#erroForm").textContent = err.message;
      if (err.status === 409 && API.cliente) { estado.hora = null; carregarDisponibilidade(); irPara(3); }
      renderRodape();
    }
  }

  // Aviso por e-mail para o Léo (FormSubmit, já ativado no Hotmail dele).
  // Se falhar, o agendamento continua valendo: ele aparece no painel.
  function avisarLeo(d) {
    if (!C.emailDestino) return;
    const diaTxt = d.dia.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    fetch(`https://formsubmit.co/ajax/${encodeURIComponent(C.emailDestino)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `Novo agendamento: ${d.nome} — ${diaTxt} às ${d.hora}`,
        _template: "table",
        _captcha: "false",
        _replyto: d.email,
        "Cliente": d.nome,
        "WhatsApp": d.whatsapp,
        "Chamar no WhatsApp": `https://wa.me/55${d.whatsapp.replace(/\D/g, "")}`,
        "E-mail": d.email,
        "Data": fmtDiaLongo(d.dia),
        "Horário": d.hora,
        "Serviços": d.servicos.map(nomeServico).join(" + "),
        "Duração estimada": fmtDur(d.duracao),
        "Valor (a partir de)": brl(d.preco),
        "Observações": d.obs || "—",
        "Confirmar no painel": `${location.origin}/admin.html`,
      }),
    }).catch(() => {});
  }

  function mostrarSucesso(d) {
    const primeiro = d.nome.split(" ")[0];
    $("#sucessoTexto").textContent = `Obrigado, ${primeiro}! O Leonardo recebeu seu pedido. Assim que ele confirmar, você recebe um e-mail. Um dia antes, mandamos um lembrete.`;
    $("#resumoFinal").innerHTML = `
      <div><span>Quando</span><b>${fmtDiaLongo(d.dia)} às ${d.hora}</b></div>
      <div><span>Serviços</span><b>${d.servicos.map(nomeServico).join("<br>")}</b></div>
      <div><span>Duração</span><b>≈ ${fmtDur(d.duracao)}</b></div>
      <div><span>Valor</span><b>a partir de ${brl(d.preco)}</b></div>`;
    const w = $("#btnWhats");
    if (C.whatsapp) {
      const msg = `Olá Leonardo! Acabei de agendar pelo site: ${d.servicos.map(nomeServico).join(" + ")} — ${fmtDiaLongo(d.dia)} às ${d.hora}. Nome: ${d.nome}.`;
      w.href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(msg)}`;
      w.hidden = false;
    }
    $("#obs").value = "";
    estado.sel = []; estado.dia = null; estado.hora = null;
    store.set("ls-sel", []);
    renderCatalogo(); renderBarra();
    irPara(5);
  }

  $("#btnNovo").addEventListener("click", () => { atualizarTudo(); irPara(1); carregarDisponibilidade(); });

  $("#btnIcs").addEventListener("click", () => {
    if (!ultimo) return;
    const d = ultimo;
    const ini = new Date(d.dia); const [h, m] = d.hora.split(":").map(Number); ini.setHours(h, m, 0, 0);
    const fim = new Date(ini.getTime() + d.duracao * 60000);
    const p = (n) => String(n).padStart(2, "0");
    const ics = (x) => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`;
    const esc = (s) => s.replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const txt = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LS Cabeleireiro//Agenda//PT", "BEGIN:VEVENT",
      `UID:${Date.now()}@lscabeleireiro`, `DTSTAMP:${ics(new Date())}`,
      `DTSTART:${ics(ini)}`, `DTEND:${ics(fim)}`,
      `SUMMARY:${esc("L.S Cabeleireiro — " + d.servicos.map(nomeServico).join(" + "))}`,
      ...(C.endereco ? [`LOCATION:${esc(C.endereco)}`] : []),
      `DESCRIPTION:${esc("Atendimento com Leonardo Sobrinho. Valor a partir de " + brl(d.preco) + ".")}`,
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Lembrete do salão", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/calendar" }));
    a.download = "agendamento-ls-cabeleireiro.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ------------------------------------------------------------ extras */
  let tToast;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove("on"), 1800);
  }

  const ig = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>';
  const yt = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1-5.8 3.1z"/></svg>';
  const R = C.redes;
  $("#redes").innerHTML = [
    R.instagramPessoal && `<a class="rede" href="https://instagram.com/${R.instagramPessoal}" target="_blank" rel="noopener">${ig}@${R.instagramPessoal}</a>`,
    R.instagramSalao && `<a class="rede" href="https://instagram.com/${R.instagramSalao}" target="_blank" rel="noopener">${ig}@${R.instagramSalao}</a>`,
    R.youtube && `<a class="rede" href="${R.youtube}" target="_blank" rel="noopener">${yt}Leonardo Sobrinho</a>`,
  ].filter(Boolean).join("");
  $("#rodapeEndereco").textContent = C.endereco || `${C.cidade || "Mauá"} · SP`;

  /* ------------------------------------------------------------ onde estamos */
  const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const fmtHora = (h) => h.replace(/^0/, "").replace(":00", "h").replace(":", "h");
  (function renderOnde() {
    // Segunda a domingo, juntando dias seguidos com o mesmo horário.
    const ordem = [1, 2, 3, 4, 5, 6, 0];
    const grupos = [];
    ordem.forEach((d) => {
      const h = C.horarios[d];
      // Para a cliente vale até que horas dá para marcar (o último horário), não até quando o Léo fica.
      const txt = h ? `${fmtHora(h.abre)} às ${fmtHora(h.ultimoHorario || h.fecha)}` : "Fechado";
      const ult = grupos[grupos.length - 1];
      if (ult && ult.txt === txt) ult.dias.push(d); else grupos.push({ txt, dias: [d] });
    });
    $("#horariosLista").innerHTML = grupos.map((g) => {
      const dias = g.dias.length > 1 ? `${NOMES_DIA[g.dias[0]]} a ${NOMES_DIA[g.dias[g.dias.length - 1]]}` : NOMES_DIA[g.dias[0]];
      return `<div><dt>${dias}</dt><dd>${g.txt}</dd></div>`;
    }).join("");

    const end = C.endereco;
    const G = C.google || {};
    if (end) { $("#ondeEndereco").textContent = end; $("#ondeEndereco").hidden = false; }
    if (C.whatsapp) {
      const w = $("#btnWhatsOnde");
      w.href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent("Olá Leonardo! Vim pelo site e queria tirar uma dúvida.")}`;
      w.hidden = false;
      const tel = C.whatsapp.replace(/^55/, "");
      $("#rodapeContato").innerHTML = `WhatsApp <a href="https://wa.me/${C.whatsapp}" target="_blank" rel="noopener">(${tel.slice(0, 2)}) ${tel.slice(2, -4)}-${tel.slice(-4)}</a>`;
    }
    const busca = end || "";
    if (G.perfil || busca) {
      const c = $("#btnComoChegar");
      c.href = G.perfil || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
      c.hidden = false;
    }
    if (busca) {
      $("#ondeMapa").innerHTML = `<iframe title="Mapa: como chegar ao L.S Cabeleireiro" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?q=${encodeURIComponent(busca)}&output=embed"></iframe>`;
      $("#ondeMapa").hidden = false;
    }

    /* avaliações no Google */
    if (G.avaliar || G.perfil) {
      $("#avaliacoes").hidden = false;
      const a = $("#btnAvaliar"), v = $("#btnVerAvaliacoes");
      if (G.avaliar) a.href = G.avaliar; else a.hidden = true;
      if (G.perfil) v.href = G.perfil; else v.hidden = true;
    }

    /* dados estruturados para o Google (cabeleireiro em Mauá) */
    const ld = {
      "@context": "https://schema.org", "@type": "HairSalon",
      name: "L.S Cabeleireiro · Leonardo Sobrinho", url: "https://leonardosobrinho.com/",
      image: "https://leonardosobrinho.com/assets/leo-atendendo.jpg",
      ...(C.whatsapp ? { telephone: `+${C.whatsapp}` } : {}),
      address: { "@type": "PostalAddress", ...(end ? { streetAddress: end } : {}), addressLocality: C.cidade || "Mauá", addressRegion: "SP", addressCountry: "BR" },
      areaServed: C.cidade || "Mauá",
      openingHoursSpecification: ordem.filter((d) => C.horarios[d]).map((d) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d],
        opens: C.horarios[d].abre, closes: C.horarios[d].fecha,
      })),
      sameAs: [R.instagramSalao && `https://instagram.com/${R.instagramSalao}`, R.instagramPessoal && `https://instagram.com/${R.instagramPessoal}`, R.youtube, G.perfil].filter(Boolean),
    };
    const sc = document.createElement("script");
    sc.type = "application/ld+json";
    sc.textContent = JSON.stringify(ld);
    document.head.appendChild(sc);
  })();

  /* ------------------------------------------------------------ antes e depois */
  (function renderGaleria() {
    const fotos = (C.galeria || []).filter((f) => f.antes && f.depois);
    if (!fotos.length) return;
    $("#trabalhos").hidden = false;
    const cats = C.categorias.filter((c) => fotos.some((f) => f.cat === c.id));
    let aba = "todos";
    const abas = [{ id: "todos", nome: "Todos" }, ...cats];
    const esc = API.esc;
    function render() {
      $("#abasGaleria").innerHTML = abas.length > 2 ? abas.map((a) =>
        `<button class="aba" role="tab" data-galeria="${a.id}" aria-selected="${a.id === aba}">${a.nome}</button>`).join("") : "";
      $("#gradeGaleria").innerHTML = fotos.filter((f) => aba === "todos" || f.cat === aba).map((f) => `
        <figure class="antes-depois">
          <div class="par">
            <div><img src="${esc(f.antes)}" alt="Antes${f.legenda ? `: ${esc(f.legenda)}` : ""}" loading="lazy"><span>Antes</span></div>
            <div><img src="${esc(f.depois)}" alt="Depois${f.legenda ? `: ${esc(f.legenda)}` : ""}" loading="lazy"><span>Depois</span></div>
          </div>
          ${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ""}
        </figure>`).join("");
    }
    $("#abasGaleria").addEventListener("click", (e) => {
      const b = e.target.closest("[data-galeria]");
      if (b) { aba = b.dataset.galeria; render(); }
    });
    render();
  })();
  $$('[data-se="galeria"]').forEach((a) => { a.hidden = $("#trabalhos").hidden; });
  $("#ano").textContent = new Date().getFullYear();

  renderAbas();
  atualizarTudo();
  renderConta();
  carregarDisponibilidade();
  API.carregarCliente();
})();
