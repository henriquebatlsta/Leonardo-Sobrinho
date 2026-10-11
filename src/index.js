// Servidor do site do L.S Cabeleireiro.
// As páginas (public/) são servidas direto pela Cloudflare; este Worker só
// responde /api/* e /confirmar, e roda os lembretes automáticos (cron).
import { C } from "./config.js";
import { porId, nomeServico, motivoIndisponivel, paraMin, agoraBrasilia, somaDias, dataValida, horaValida, fmtDataLonga } from "./agenda.js";
import { hashSenha, conferirSenha, criarSessao, sessaoAtual, encerrarSessao, cookieSaida, tokenAleatorio, sha256, iguais } from "./auth.js";
import { emailConfirmado, emailLembrete, emailDesmarcado, emailRedefinirSenha, emailParaLeo } from "./emails.js";

class Erro extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const json = (dados, status = 200, headers = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

async function corpo(request) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new Erro(415, "Envie os dados em JSON.");
  try { return await request.json(); } catch { throw new Erro(400, "Dados inválidos."); }
}

const texto = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const CAMPOS_ENDERECO = ["cep", "rua", "numero", "complemento", "bairro", "cidade", "uf"];
const clientePublico = (c) => ({
  id: c.id, nome: c.nome, email: c.email, whatsapp: c.whatsapp, admin: !!c.admin,
  ...Object.fromEntries(CAMPOS_ENDERECO.map((k) => [k, c[k]])),
});

function lerEndereco(b) {
  const e = Object.fromEntries(CAMPOS_ENDERECO.map((k) => [k, texto(b[k], 120)]));
  e.cep = soDigitos(e.cep).slice(0, 8);
  e.uf = e.uf.toUpperCase().slice(0, 2);
  return e;
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 6) throw new Erro(400, "A senha precisa ter pelo menos 6 caracteres.");
  if (senha.length > 200) throw new Erro(400, "Senha longa demais.");
}

async function exigirCliente(env, request) {
  const s = await sessaoAtual(env, request);
  if (!s || !s.cliente_id) throw new Erro(401, "Entre na sua conta para continuar.");
  return s;
}
async function exigirAdmin(env, request) {
  const s = await sessaoAtual(env, request);
  if (s && s.admin) return s;
  // Sessão aberta antes de a conta virar admin, ou pelo login comum: vale a marca da conta.
  const c = s && s.cliente_id && (await env.DB.prepare("SELECT admin FROM clientes WHERE id = ?").bind(s.cliente_id).first());
  if (!c || !c.admin) throw new Erro(401, "Entre no painel com o e-mail e a senha do Léo.");
  return { ...s, admin: true };
}

/* ------------------------------------------------------------ clientes */

async function cadastrar(env, request) {
  const b = await corpo(request);
  const nome = texto(b.nome, 120);
  const email = texto(b.email, 200).toLowerCase();
  const whatsapp = soDigitos(b.whatsapp).slice(0, 13);
  if (nome.length < 3) throw new Erro(400, "Informe seu nome completo.");
  if (!emailOk(email)) throw new Erro(400, "Esse e-mail parece incompleto.");
  if (whatsapp.length < 10) throw new Erro(400, "Informe um WhatsApp com DDD.");
  validarSenha(b.senha);
  const existe = await env.DB.prepare("SELECT id FROM clientes WHERE email = ?").bind(email).first();
  if (existe) throw new Erro(409, "Já existe uma conta com esse e-mail. Use “Entrar” ou “Esqueci minha senha”.");
  const { hash, salt } = await hashSenha(b.senha);
  const end = lerEndereco(b);
  const r = await env.DB.prepare(
    `INSERT INTO clientes (nome, email, whatsapp, senha_hash, senha_salt, ${CAMPOS_ENDERECO.join(", ")})
     VALUES (?, ?, ?, ?, ?, ${CAMPOS_ENDERECO.map(() => "?").join(", ")})`
  ).bind(nome, email, whatsapp, hash, salt, ...CAMPOS_ENDERECO.map((k) => end[k])).run();
  const id = r.meta.last_row_id;
  const cliente = await env.DB.prepare("SELECT * FROM clientes WHERE id = ?").bind(id).first();
  return json({ cliente: clientePublico(cliente) }, 201, { "Set-Cookie": await criarSessao(env, { clienteId: id }) });
}

async function entrar(env, request) {
  const b = await corpo(request);
  const email = texto(b.email, 200).toLowerCase();
  const c = await env.DB.prepare("SELECT * FROM clientes WHERE email = ?").bind(email).first();
  if (!c || typeof b.senha !== "string" || !(await conferirSenha(b.senha, c))) {
    await espera(600);
    throw new Erro(401, "E-mail ou senha incorretos.");
  }
  // A conta do Léo (admin = 1) entra já com acesso ao painel.
  const admin = !!c.admin;
  return json({ cliente: clientePublico(c), admin }, 200, { "Set-Cookie": await criarSessao(env, { clienteId: c.id, admin }) });
}

async function sair(env, request) {
  await encerrarSessao(env, request);
  return json({ ok: true }, 200, { "Set-Cookie": cookieSaida });
}

async function eu(env, request) {
  const s = await exigirCliente(env, request);
  const c = await env.DB.prepare("SELECT * FROM clientes WHERE id = ?").bind(s.cliente_id).first();
  if (!c) throw new Erro(401, "Entre na sua conta para continuar.");
  return json({ cliente: clientePublico(c) });
}

async function atualizarEu(env, request) {
  const s = await exigirCliente(env, request);
  const b = await corpo(request);
  const c = await env.DB.prepare("SELECT * FROM clientes WHERE id = ?").bind(s.cliente_id).first();
  const nome = texto(b.nome, 120);
  const whatsapp = soDigitos(b.whatsapp).slice(0, 13);
  if (nome.length < 3) throw new Erro(400, "Informe seu nome completo.");
  if (whatsapp.length < 10) throw new Erro(400, "Informe um WhatsApp com DDD.");
  const end = lerEndereco(b);
  await env.DB.prepare(`UPDATE clientes SET nome = ?, whatsapp = ?, ${CAMPOS_ENDERECO.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .bind(nome, whatsapp, ...CAMPOS_ENDERECO.map((k) => end[k]), c.id).run();
  if (b.novaSenha) {
    if (typeof b.senhaAtual !== "string" || !(await conferirSenha(b.senhaAtual, c))) throw new Erro(400, "A senha atual não confere.");
    validarSenha(b.novaSenha);
    const { hash, salt } = await hashSenha(b.novaSenha);
    await env.DB.prepare("UPDATE clientes SET senha_hash = ?, senha_salt = ? WHERE id = ?").bind(hash, salt, c.id).run();
    await env.DB.prepare("DELETE FROM sessoes WHERE cliente_id = ? AND token_hash != ?").bind(c.id, s.tokenHash).run();
  }
  const novo = await env.DB.prepare("SELECT * FROM clientes WHERE id = ?").bind(c.id).first();
  return json({ cliente: clientePublico(novo) });
}

async function esqueciSenha(env, request) {
  const b = await corpo(request);
  const email = texto(b.email, 200).toLowerCase();
  const c = await env.DB.prepare("SELECT * FROM clientes WHERE email = ?").bind(email).first();
  let enviado = true;
  if (c) {
    const token = tokenAleatorio();
    const expira = new Date(Date.now() + 3600000).toISOString();
    await env.DB.prepare("INSERT INTO redefinicoes (token_hash, cliente_id, expira_em) VALUES (?, ?, ?)").bind(await sha256(token), c.id, expira).run();
    enviado = await emailRedefinirSenha(env, c, token);
  }
  // Mesma resposta exista ou não a conta, para não revelar quem é cliente.
  return json({ ok: true, emailAtivo: enviado });
}

async function redefinirSenha(env, request) {
  const b = await corpo(request);
  validarSenha(b.senha);
  const th = await sha256(texto(b.token, 100));
  const r = await env.DB.prepare("SELECT cliente_id, expira_em FROM redefinicoes WHERE token_hash = ?").bind(th).first();
  if (!r || r.expira_em < new Date().toISOString()) throw new Erro(400, "Esse link expirou. Peça um novo em “Esqueci minha senha”.");
  const { hash, salt } = await hashSenha(b.senha);
  await env.DB.batch([
    env.DB.prepare("UPDATE clientes SET senha_hash = ?, senha_salt = ? WHERE id = ?").bind(hash, salt, r.cliente_id),
    env.DB.prepare("DELETE FROM redefinicoes WHERE cliente_id = ?").bind(r.cliente_id),
    env.DB.prepare("DELETE FROM sessoes WHERE cliente_id = ?").bind(r.cliente_id),
  ]);
  return json({ ok: true }, 200, { "Set-Cookie": await criarSessao(env, { clienteId: r.cliente_id }) });
}

/* ------------------------------------------------------------ agenda */

async function disponibilidade(env, url) {
  const hoje = agoraBrasilia().data;
  const de = dataValida(url.searchParams.get("de")) ? url.searchParams.get("de") : hoje;
  const ate = dataValida(url.searchParams.get("ate")) ? url.searchParams.get("ate") : somaDias(hoje, C.diasParaFrente);
  const [oc, bl] = await env.DB.batch([
    env.DB.prepare("SELECT data, hora, duracao FROM agendamentos WHERE status != 'cancelado' AND data BETWEEN ? AND ?").bind(de, ate),
    env.DB.prepare("SELECT data, hora_inicio, hora_fim FROM bloqueios WHERE data BETWEEN ? AND ?").bind(de, ate),
  ]);
  // Só o necessário para pintar a agenda: nada de nomes de outras clientes.
  return json({ ocupados: oc.results, bloqueios: bl.results });
}

async function dadosDoDia(env, data) {
  const [oc, bl] = await env.DB.batch([
    env.DB.prepare("SELECT id, hora, duracao FROM agendamentos WHERE status != 'cancelado' AND data = ?").bind(data),
    env.DB.prepare("SELECT hora_inicio, hora_fim FROM bloqueios WHERE data = ?").bind(data),
  ]);
  return { ocupados: oc.results, bloqueios: bl.results };
}

async function criarAgendamento(env, request) {
  const s = await exigirCliente(env, request);
  const b = await corpo(request);
  const ids = Array.isArray(b.servicos) ? [...new Set(b.servicos)].filter((id) => porId[id]) : [];
  if (!ids.length) throw new Erro(400, "Escolha ao menos um serviço.");
  if (!dataValida(b.data) || !horaValida(b.hora)) throw new Erro(400, "Escolha o dia e o horário.");
  const servicos = ids.map((id) => porId[id]);
  const duracao = servicos.reduce((t, sv) => t + sv.duracao, 0);
  const preco = servicos.reduce((t, sv) => t + sv.preco, 0);

  const motivo = motivoIndisponivel({ data: b.data, hora: b.hora, duracao, ...(await dadosDoDia(env, b.data)) });
  if (motivo) throw new Erro(409, motivo);

  const r = await env.DB.prepare(
    "INSERT INTO agendamentos (cliente_id, data, hora, duracao, servicos, preco, obs, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(s.cliente_id, b.data, b.hora, duracao, JSON.stringify(servicos.map(nomeServico)), preco, texto(b.obs, 500), tokenAleatorio(16)).run();
  const id = r.meta.last_row_id;

  // Duas pessoas podem ter apertado ao mesmo tempo: fica com quem chegou primeiro.
  const { ocupados, bloqueios } = await dadosDoDia(env, b.data);
  const antes = ocupados.filter((o) => o.id < id);
  if (motivoIndisponivel({ data: b.data, hora: b.hora, duracao, ocupados: antes, bloqueios })) {
    await env.DB.prepare("DELETE FROM agendamentos WHERE id = ?").bind(id).run();
    throw new Erro(409, "Esse horário acabou de ser reservado por outra pessoa.");
  }
  const a = await agendamentoCompleto(env, id);
  return json({ agendamento: { ...paraCliente(a), nome: a.nome, email: a.email, whatsapp: a.whatsapp } }, 201);
}

async function agendamentoCompleto(env, id) {
  return env.DB.prepare(
    `SELECT a.*, c.nome, c.email, c.whatsapp FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id WHERE a.id = ?`
  ).bind(id).first();
}

const paraCliente = (a) => ({
  id: a.id, data: a.data, hora: a.hora, duracao: a.duracao, servicos: JSON.parse(a.servicos), preco: a.preco,
  obs: a.obs, status: a.status, motivo_cancelado: a.motivo_cancelado, cliente_confirmou: !!a.cliente_confirmou,
});

async function meusAgendamentos(env, request) {
  const s = await exigirCliente(env, request);
  const { results } = await env.DB.prepare("SELECT * FROM agendamentos WHERE cliente_id = ? ORDER BY data DESC, hora DESC LIMIT 50")
    .bind(s.cliente_id).all();
  return json({ agendamentos: results.map(paraCliente), hoje: agoraBrasilia().data });
}

async function clienteCancela(env, request, id) {
  const s = await exigirCliente(env, request);
  const a = await agendamentoCompleto(env, id);
  if (!a || a.cliente_id !== s.cliente_id) throw new Erro(404, "Agendamento não encontrado.");
  if (a.status === "cancelado") return json({ agendamento: paraCliente(a) });
  if (a.data < agoraBrasilia().data) throw new Erro(400, "Esse horário já passou.");
  await env.DB.prepare("UPDATE agendamentos SET status = 'cancelado', motivo_cancelado = 'Cancelado pela cliente' WHERE id = ?").bind(id).run();
  await emailParaLeo(env, `Cancelamento: ${a.nome} — ${fmtDataLonga(a.data)} às ${a.hora}`,
    `${a.nome} cancelou pelo site o horário de ${fmtDataLonga(a.data)} às ${a.hora}.\nServiços: ${JSON.parse(a.servicos).join(" + ")}\nWhatsApp: https://wa.me/55${a.whatsapp}`);
  return json({ agendamento: paraCliente(await agendamentoCompleto(env, id)) });
}

// Link do e-mail de lembrete: a cliente confirma que vai.
async function confirmarPresenca(env, url) {
  const id = Number(url.searchParams.get("id"));
  const t = String(url.searchParams.get("t") || "");
  const a = id ? await agendamentoCompleto(env, id) : null;
  if (!a || !iguais(t, a.token)) return pagina("Link inválido", "Não encontramos esse agendamento. Entre na sua conta para ver seus horários.", 404);
  if (a.status === "cancelado") return pagina("Horário desmarcado", "Esse horário foi desmarcado. Você pode escolher outro no site.");
  await env.DB.prepare("UPDATE agendamentos SET cliente_confirmou = 1 WHERE id = ?").bind(id).run();
  const nome = a.nome.split(" ")[0];
  return pagina("Presença confirmada ✓", `Obrigado, ${nome}! Te espero ${fmtDataLonga(a.data)} às ${a.hora}.`);
}

function pagina(titulo, msg, status = 200) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · L.S Cabeleireiro</title><link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/styles.css"></head>
<body class="pagina-simples"><main class="cartao-simples"><img src="/assets/monograma.png" alt="" width="64"><h1>${esc(titulo)}</h1><p>${esc(msg)}</p>
<p><a class="btn btn-escuro" href="/conta.html">Ver meus horários</a></p></main></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/* ------------------------------------------------------------ painel do Léo */

// O Léo entra com o e-mail e a senha da conta dele (clientes.admin = 1).
async function adminEntrar(env, request) {
  const b = await corpo(request);
  const email = texto(b.email, 200).toLowerCase();
  const c = await env.DB.prepare("SELECT * FROM clientes WHERE email = ? AND admin = 1").bind(email).first();
  if (!c || typeof b.senha !== "string" || !(await conferirSenha(b.senha, c))) {
    await espera(1000);
    throw new Erro(401, "E-mail ou senha incorretos.");
  }
  return json({ ok: true }, 200, { "Set-Cookie": await criarSessao(env, { clienteId: c.id, admin: true }) });
}

const paraAdmin = (a) => ({ ...paraCliente(a), nome: a.nome, email: a.email, whatsapp: a.whatsapp, lembrete_enviado: !!a.lembrete_enviado, token: a.token });

async function adminAgenda(env, request, url) {
  await exigirAdmin(env, request);
  const hoje = agoraBrasilia().data;
  const de = dataValida(url.searchParams.get("de")) ? url.searchParams.get("de") : hoje;
  const ate = dataValida(url.searchParams.get("ate")) ? url.searchParams.get("ate") : somaDias(de, 60);
  const [ag, bl] = await env.DB.batch([
    env.DB.prepare(`SELECT a.*, c.nome, c.email, c.whatsapp FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id
      WHERE a.data BETWEEN ? AND ? ORDER BY a.data, a.hora`).bind(de, ate),
    env.DB.prepare("SELECT * FROM bloqueios WHERE data BETWEEN ? AND ? ORDER BY data, hora_inicio").bind(de, ate),
  ]);
  return json({ hoje, de, ate, agendamentos: ag.results.map(paraAdmin), bloqueios: bl.results, emailAtivo: !!(env.EMAIL && env.EMAIL_FROM), siteUrl: env.SITE_URL });
}

async function adminConfirmar(env, request, id) {
  await exigirAdmin(env, request);
  const a = await agendamentoCompleto(env, id);
  if (!a) throw new Erro(404, "Agendamento não encontrado.");
  if (a.status === "cancelado") throw new Erro(400, "Esse horário já foi desmarcado.");
  await env.DB.prepare("UPDATE agendamentos SET status = 'confirmado' WHERE id = ?").bind(id).run();
  const emailEnviado = await emailConfirmado(env, a);
  return json({ agendamento: paraAdmin(await agendamentoCompleto(env, id)), emailEnviado });
}

async function adminDesmarcar(env, request, id) {
  await exigirAdmin(env, request);
  const b = await corpo(request);
  const a = await agendamentoCompleto(env, id);
  if (!a) throw new Erro(404, "Agendamento não encontrado.");
  const motivo = texto(b.motivo, 300);
  await env.DB.prepare("UPDATE agendamentos SET status = 'cancelado', motivo_cancelado = ? WHERE id = ?").bind(motivo || "Desmarcado pelo salão", id).run();
  const emailEnviado = b.avisar === false ? false : await emailDesmarcado(env, a, motivo);
  return json({ agendamento: paraAdmin(await agendamentoCompleto(env, id)), emailEnviado });
}

async function adminCriarBloqueio(env, request) {
  await exigirAdmin(env, request);
  const b = await corpo(request);
  const de = b.de, ate = b.ate || b.de;
  if (!dataValida(de) || !dataValida(ate) || ate < de) throw new Erro(400, "Escolha as datas do bloqueio.");
  const parcial = b.horaInicio || b.horaFim;
  if (parcial && (!horaValida(b.horaInicio) || !horaValida(b.horaFim) || b.horaFim <= b.horaInicio)) throw new Erro(400, "Confira o horário de início e fim.");
  const motivo = texto(b.motivo, 200);
  const datas = [];
  for (let d = de; d <= ate && datas.length < 120; d = somaDias(d, 1)) datas.push(d);
  await env.DB.batch(datas.map((d) =>
    env.DB.prepare("INSERT INTO bloqueios (data, hora_inicio, hora_fim, motivo) VALUES (?, ?, ?, ?)")
      .bind(d, parcial ? b.horaInicio : "", parcial ? b.horaFim : "", motivo)));
  // Avisa quantas clientes já tinham horário nesses dias, para o Léo decidir se desmarca.
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.data, a.hora, a.duracao FROM agendamentos a WHERE a.status != 'cancelado' AND a.data BETWEEN ? AND ?`).bind(de, ate).all();
  const afetados = results.filter((a) => !parcial ||
    (paraMin(a.hora) < paraMin(b.horaFim) && paraMin(b.horaInicio) < paraMin(a.hora) + a.duracao));
  return json({ ok: true, dias: datas.length, conflitos: afetados.map((a) => a.id) }, 201);
}

async function adminRemoverBloqueio(env, request, id) {
  await exigirAdmin(env, request);
  await env.DB.prepare("DELETE FROM bloqueios WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function adminClientes(env, request) {
  await exigirAdmin(env, request);
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM agendamentos a WHERE a.cliente_id = c.id AND a.status != 'cancelado') AS total
     FROM clientes c ORDER BY c.nome COLLATE NOCASE`).all();
  return json({ clientes: results.map((c) => ({ ...clientePublico(c), criado_em: c.criado_em, total: c.total })) });
}

/* ------------------------------------------------------------ lembretes (cron) */

export async function enviarLembretes(env) {
  const agora = agoraBrasilia();
  // Manda a partir das 9h de Brasília, para não acordar ninguém.
  if (agora.hora < 9) return { enviados: 0 };
  const amanha = somaDias(agora.data, 1);
  const { results } = await env.DB.prepare(
    `SELECT a.*, c.nome, c.email, c.whatsapp FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id
     WHERE a.data = ? AND a.status != 'cancelado' AND a.lembrete_enviado = 0`).bind(amanha).all();
  let enviados = 0;
  for (const a of results) {
    if (await emailLembrete(env, a)) {
      await env.DB.prepare("UPDATE agendamentos SET lembrete_enviado = 1 WHERE id = ?").bind(a.id).run();
      enviados++;
    }
  }
  await env.DB.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(new Date().toISOString()).run();
  await env.DB.prepare("DELETE FROM redefinicoes WHERE expira_em < ?").bind(new Date().toISOString()).run();
  return { enviados };
}

/* ------------------------------------------------------------ rotas */

async function rotear(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;
  let r;

  if (p === "/confirmar" && m === "GET") return confirmarPresenca(env, url);

  if (p === "/api/cadastro" && m === "POST") return cadastrar(env, request);
  if (p === "/api/entrar" && m === "POST") return entrar(env, request);
  if (p === "/api/sair" && m === "POST") return sair(env, request);
  if (p === "/api/eu" && m === "GET") return eu(env, request);
  if (p === "/api/eu" && m === "PUT") return atualizarEu(env, request);
  if (p === "/api/senha/esqueci" && m === "POST") return esqueciSenha(env, request);
  if (p === "/api/senha/redefinir" && m === "POST") return redefinirSenha(env, request);

  if (p === "/api/disponibilidade" && m === "GET") return disponibilidade(env, url);
  if (p === "/api/agendamentos" && m === "POST") return criarAgendamento(env, request);
  if (p === "/api/agendamentos/meus" && m === "GET") return meusAgendamentos(env, request);
  if ((r = p.match(/^\/api\/agendamentos\/(\d+)\/cancelar$/)) && m === "POST") return clienteCancela(env, request, Number(r[1]));

  if (p === "/api/admin/entrar" && m === "POST") return adminEntrar(env, request);
  if (p === "/api/admin/sair" && m === "POST") return sair(env, request);
  if (p === "/api/admin/agenda" && m === "GET") return adminAgenda(env, request, url);
  if ((r = p.match(/^\/api\/admin\/agendamentos\/(\d+)\/confirmar$/)) && m === "POST") return adminConfirmar(env, request, Number(r[1]));
  if ((r = p.match(/^\/api\/admin\/agendamentos\/(\d+)\/desmarcar$/)) && m === "POST") return adminDesmarcar(env, request, Number(r[1]));
  if (p === "/api/admin/bloqueios" && m === "POST") return adminCriarBloqueio(env, request);
  if ((r = p.match(/^\/api\/admin\/bloqueios\/(\d+)$/)) && m === "DELETE") return adminRemoverBloqueio(env, request, Number(r[1]));
  if (p === "/api/admin/clientes" && m === "GET") return adminClientes(env, request);

  if (p.startsWith("/api/")) throw new Erro(404, "Rota não encontrada.");
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await rotear(request, env);
    } catch (err) {
      if (err instanceof Erro) return json({ erro: err.message }, err.status);
      console.error(err);
      return json({ erro: "Algo deu errado do nosso lado. Tente de novo em instantes." }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(enviarLembretes(env));
  },
};
