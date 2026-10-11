// E-mails para as clientes, enviados pelo Cloudflare Email Service (binding EMAIL).
// Se o envio de e-mail ainda não estiver ativado na conta, nada quebra:
// a função só devolve false e o painel mostra os botões de WhatsApp.
import { C } from "./config.js";
import { fmtDataLonga, brl } from "./agenda.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const primeiroNome = (nome) => String(nome).trim().split(/\s+/)[0];

function moldura(titulo, corpoHtml) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3ece0;font-family:Arial,Helvetica,sans-serif;color:#342611">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
  <p style="margin:0 0 18px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6a4f">L.S Cabeleireiro · Leonardo Sobrinho</p>
  <div style="background:#fffaf2;border-radius:16px;padding:24px 22px;border:1px solid #e6d9c2">
    <h1 style="margin:0 0 14px;font-size:22px;color:#342611">${esc(titulo)}</h1>
    ${corpoHtml}
  </div>
  <p style="margin:18px 0 0;font-size:12px;color:#7a6a4f">Você recebeu este e-mail porque tem um horário marcado no site do L.S Cabeleireiro.</p>
</div></body></html>`;
}

function resumoHtml(a) {
  const linha = (rot, val) => `<tr><td style="padding:6px 0;color:#7a6a4f;font-size:14px;width:96px">${rot}</td><td style="padding:6px 0;font-size:15px"><b>${val}</b></td></tr>`;
  return `<table style="border-collapse:collapse;width:100%;margin:6px 0 18px">
    ${linha("Quando", `${esc(fmtDataLonga(a.data))} às ${esc(a.hora)}`)}
    ${linha("Serviços", JSON.parse(a.servicos).map(esc).join("<br>"))}
    ${linha("Valor", `a partir de ${esc(brl(a.preco))}`)}
    ${C.endereco ? linha("Onde", esc(C.endereco)) : ""}
  </table>`;
}
const resumoTexto = (a) =>
  `Quando: ${fmtDataLonga(a.data)} às ${a.hora}\nServiços: ${JSON.parse(a.servicos).join(" + ")}\nValor: a partir de ${brl(a.preco)}` +
  (C.endereco ? `\nOnde: ${C.endereco}` : "");

const botao = (href, txt) =>
  `<p style="margin:0 0 8px"><a href="${esc(href)}" style="display:inline-block;background:#342611;color:#f3ece0;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:bold">${esc(txt)}</a></p>`;

export const linkPresenca = (env, a) => `${env.SITE_URL}/confirmar?id=${a.id}&t=${a.token}`;

async function enviar(env, { para, nome, assunto, html, texto }) {
  if (!env.EMAIL || !env.EMAIL_FROM) return false;
  try {
    await env.EMAIL.send({
      from: { email: env.EMAIL_FROM, name: "Leonardo Sobrinho · L.S Cabeleireiro" },
      to: nome ? { email: para, name: nome } : para,
      ...(C.emailDestino ? { replyTo: C.emailDestino } : {}),
      subject: assunto,
      html,
      text: texto,
    });
    return true;
  } catch (err) {
    console.error("Falha ao enviar e-mail:", err && err.message);
    return false;
  }
}

/** O Léo apertou "Confirmar": avisa a cliente que o horário está garantido. */
export function emailConfirmado(env, a) {
  const nome = primeiroNome(a.nome);
  return enviar(env, {
    para: a.email, nome: a.nome,
    assunto: `Seu horário foi confirmado: ${fmtDataLonga(a.data)} às ${a.hora}`,
    html: moldura("Horário confirmado ✓", `<p style="font-size:15px;line-height:1.5">Oi, ${esc(nome)}! O Léo confirmou o seu horário. Está tudo certo, te espero:</p>${resumoHtml(a)}
      <p style="font-size:14px;line-height:1.5;color:#5c4d33">Se precisar remarcar, responda este e-mail ou chame no WhatsApp.</p>`),
    texto: `Oi, ${nome}! O Léo confirmou o seu horário. Está tudo certo, te espero:\n\n${resumoTexto(a)}\n\nSe precisar remarcar, responda este e-mail ou chame no WhatsApp.`,
  });
}

/** Um dia antes: "amanhã você tem horário comigo, podemos confirmar?" */
export function emailLembrete(env, a) {
  const nome = primeiroNome(a.nome);
  const link = linkPresenca(env, a);
  return enviar(env, {
    para: a.email, nome: a.nome,
    assunto: `Amanhã você tem horário comigo, ${nome}! Podemos confirmar?`,
    html: moldura("Seu horário é amanhã", `<p style="font-size:15px;line-height:1.5">Oi, ${esc(nome)}! Passando para lembrar que amanhã você tem um horário comigo. Podemos confirmar?</p>${resumoHtml(a)}
      ${botao(link, "Sim, confirmo minha presença")}
      <p style="font-size:14px;line-height:1.5;color:#5c4d33">Não vai conseguir vir? Responda este e-mail ou chame no WhatsApp para remarcarmos.</p>`),
    texto: `Oi, ${nome}! Passando para lembrar que amanhã você tem um horário comigo. Podemos confirmar?\n\n${resumoTexto(a)}\n\nPara confirmar sua presença, abra: ${link}\n\nNão vai conseguir vir? Responda este e-mail ou chame no WhatsApp para remarcarmos.`,
  });
}

/** O Léo desmarcou o horário (não vai poder atender). */
export function emailDesmarcado(env, a, motivo) {
  const nome = primeiroNome(a.nome);
  const extra = motivo ? `<p style="font-size:15px;line-height:1.5"><i>${esc(motivo)}</i></p>` : "";
  return enviar(env, {
    para: a.email, nome: a.nome,
    assunto: `Seu horário de ${fmtDataLonga(a.data)} foi desmarcado`,
    html: moldura("Horário desmarcado", `<p style="font-size:15px;line-height:1.5">Oi, ${esc(nome)}. Infelizmente não vou conseguir te atender neste horário, me desculpe:</p>${resumoHtml(a)}${extra}
      ${botao(`${env.SITE_URL}/#agendar`, "Escolher outro horário")}`),
    texto: `Oi, ${nome}. Infelizmente não vou conseguir te atender neste horário, me desculpe:\n\n${resumoTexto(a)}${motivo ? `\n\n${motivo}` : ""}\n\nPara escolher outro horário: ${env.SITE_URL}/#agendar`,
  });
}

/** Esqueci minha senha. */
export function emailRedefinirSenha(env, cliente, token) {
  const link = `${env.SITE_URL}/conta.html#redefinir=${token}`;
  return enviar(env, {
    para: cliente.email, nome: cliente.nome,
    assunto: "Crie uma nova senha · L.S Cabeleireiro",
    html: moldura("Nova senha", `<p style="font-size:15px;line-height:1.5">Oi, ${esc(primeiroNome(cliente.nome))}! Recebemos um pedido para trocar a sua senha. O link vale por 1 hora.</p>${botao(link, "Criar nova senha")}
      <p style="font-size:13px;color:#7a6a4f">Se não foi você, é só ignorar este e-mail.</p>`),
    texto: `Recebemos um pedido para trocar a sua senha. Abra este link (vale por 1 hora): ${link}\n\nSe não foi você, é só ignorar este e-mail.`,
  });
}

/** Avisos para o Léo (cliente cancelou pelo site). */
export function emailParaLeo(env, assunto, texto) {
  if (!C.emailDestino) return Promise.resolve(false);
  return enviar(env, { para: C.emailDestino, assunto, html: moldura(assunto, `<p style="font-size:15px;line-height:1.5;white-space:pre-line">${esc(texto)}</p>`), texto });
}
