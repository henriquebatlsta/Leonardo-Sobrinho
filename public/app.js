(() => {
  "use strict";
  const C = window.LS_CONFIG;
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

  function horariosDoDia(d) {
    const exp = C.horarios[d.getDay()];
    if (!exp) return [];
    const dur = Math.max(duracaoTotal(), C.intervaloMinutos);
    const abre = paraMin(exp.abre), fecha = paraMin(exp.fecha);
    let minimo = -1;
    if (mesmoDia(d, new Date())) {
      const agora = new Date();
      minimo = agora.getHours() * 60 + agora.getMinutes() + C.antecedenciaMinimaHoras * 60;
    }
    const pausas = (C.pausas || []).map((p) => [paraMin(p.inicio), paraMin(p.fim)]);
    const out = [];
    for (let t = abre; t + dur <= fecha; t += C.intervaloMinutos) {
      if (t < minimo) continue;
      if (pausas.some(([i, f]) => t >= i && t < f)) continue; // não começa durante a pausa
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
      const fechado = !C.horarios[d.getDay()];
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
    av.textContent = estado.passo === 4 ? "Confirmar agendamento" : "Continuar";
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

  /* ------------------------------------------------------------ formulário */
  const form = $("#formDados");
  const tel = form.elements.whatsapp;
  tel.addEventListener("input", () => {
    const d = tel.value.replace(/\D/g, "").slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    tel.value = v;
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); enviar(); });
  form.addEventListener("input", (e) => { e.target.removeAttribute("aria-invalid"); $("#erroForm").textContent = ""; });

  function validar() {
    const f = form.elements;
    const erros = [];
    if (f.nome.value.trim().length < 3) erros.push([f.nome, "Informe seu nome."]);
    const dig = f.whatsapp.value.replace(/\D/g, "");
    if (dig.length < 10) erros.push([f.whatsapp, "Informe um WhatsApp com DDD."]);
    if (f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) erros.push([f.email, "Esse e-mail parece incompleto."]);
    erros.forEach(([el]) => el.setAttribute("aria-invalid", "true"));
    if (erros.length) { $("#erroForm").textContent = erros[0][1]; erros[0][0].focus(); }
    return !erros.length;
  }

  let ultimo = null;

  async function enviar() {
    if (!validar()) return;
    const f = form.elements;
    const servicos = estado.sel.map((id) => porId[id]);
    const dig = f.whatsapp.value.replace(/\D/g, "");
    const dados = {
      nome: f.nome.value.trim(),
      whatsapp: f.whatsapp.value.trim(),
      email: f.email.value.trim(),
      obs: f.obs.value.trim(),
      dia: new Date(estado.dia),
      hora: estado.hora,
      servicos,
      duracao: duracaoTotal(),
      preco: precoTotal(),
    };
    const diaTxt = dados.dia.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

    const btn = $("#btnAvancar");
    btn.disabled = true; btn.textContent = "Enviando…";

    let teste = !C.emailDestino;
    const robo = !!f._honey.value; // campo invisível preenchido = robô
    if (!teste && !robo) {
      try {
        const resp = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(C.emailDestino)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            _subject: `Novo agendamento: ${dados.nome} — ${diaTxt} às ${dados.hora}`,
            _template: "table",
            _captcha: "false",
            ...(dados.email ? { _replyto: dados.email } : {}),
            "Cliente": dados.nome,
            "WhatsApp": dados.whatsapp,
            "Chamar no WhatsApp": `https://wa.me/55${dig}`,
            "E-mail": dados.email || "não informado",
            "Data": fmtDiaLongo(dados.dia),
            "Horário": dados.hora,
            "Serviços": servicos.map(nomeServico).join(" + "),
            "Duração estimada": fmtDur(dados.duracao),
            "Valor (a partir de)": brl(dados.preco),
            "Observações": dados.obs || "—",
          }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || String(json.success) !== "true") throw new Error(json.message || resp.status);
      } catch (err) {
        console.error(err);
        $("#erroForm").textContent = C.whatsapp
          ? "Não conseguimos enviar agora. Tente de novo ou chame no WhatsApp."
          : "Não conseguimos enviar agora. Verifique sua conexão e tente de novo.";
        renderRodape();
        return;
      }
    }

    ultimo = dados;
    mostrarSucesso(dados, teste);
  }

  function mostrarSucesso(d, teste) {
    const primeiro = d.nome.split(" ")[0];
    $("#sucessoTexto").textContent = `Obrigado, ${primeiro}! O Leonardo recebeu seu pedido e vai te esperar no horário abaixo. Se precisar remarcar, é só avisar.`;
    $("#resumoFinal").innerHTML = `
      <div><span>Quando</span><b>${fmtDiaLongo(d.dia)} às ${d.hora}</b></div>
      <div><span>Serviços</span><b>${d.servicos.map(nomeServico).join("<br>")}</b></div>
      <div><span>Duração</span><b>≈ ${fmtDur(d.duracao)}</b></div>
      <div><span>Valor</span><b>a partir de ${brl(d.preco)}</b></div>`;
    $("#modoTeste").hidden = !teste;
    const w = $("#btnWhats");
    if (C.whatsapp) {
      const msg = `Olá Leonardo! Acabei de agendar pelo site: ${d.servicos.map(nomeServico).join(" + ")} — ${fmtDiaLongo(d.dia)} às ${d.hora}. Nome: ${d.nome}.`;
      w.href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(msg)}`;
      w.hidden = false;
    }
    form.reset();
    estado.sel = []; estado.dia = null; estado.hora = null;
    store.set("ls-sel", []);
    renderCatalogo(); renderBarra();
    irPara(5);
  }

  $("#btnNovo").addEventListener("click", () => { atualizarTudo(); irPara(1); });

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
  $("#rodapeEndereco").textContent = C.endereco || "";
  $("#ano").textContent = new Date().getFullYear();

  renderAbas();
  atualizarTudo();
})();
