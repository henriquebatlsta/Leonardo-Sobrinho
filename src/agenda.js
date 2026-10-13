// Regras de horário, iguais às do site (public/app.js), conferidas no servidor
// para ninguém marcar em dia bloqueado, fora do expediente ou em cima de outra cliente.
import { C } from "./config.js";

export const porId = Object.fromEntries(C.servicos.map((s) => [s.id, s]));
export const nomeServico = (s) => s.nome + (s.nota ? ` (${s.nota})` : "");

export const paraMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const paraHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// O salão fica em São Paulo (UTC-3, sem horário de verão desde 2019).
const FUSO_MIN = -180;
export function agoraBrasilia() {
  const d = new Date(Date.now() + FUSO_MIN * 60000);
  const data = d.toISOString().slice(0, 10);
  return { data, minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), hora: d.getUTCHours() };
}
export function somaDias(data, n) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diaDaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();
export const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
export const horaValida = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || "");

export function fmtDataLonga(data) {
  return new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
export const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const sobrepoe = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/** Horário do dia: o que o Léo abriu de exceção (aberturas) ou o normal da semana. */
export function expediente(data, abertura) {
  if (abertura) return { abre: abertura.abre, ultimoHorario: abertura.ultimo, fecha: abertura.fecha };
  return C.horarios[diaDaSemana(data)];
}

/**
 * Diz por que um horário não pode ser marcado, ou null se está livre.
 * `ocupados` são os agendamentos ativos do dia ({hora, duracao}) e
 * `bloqueios` os bloqueios do dia ({hora_inicio, hora_fim}).
 */
export function motivoIndisponivel({ data, hora, duracao, ocupados, bloqueios, abertura }) {
  const exp = expediente(data, abertura);
  if (!exp) return "O salão não abre nesse dia.";
  const agora = agoraBrasilia();
  if (data < agora.data || data > somaDias(agora.data, C.diasParaFrente - 1)) return "Essa data não está aberta para agendamento.";
  const ini = paraMin(hora);
  const dur = Math.max(duracao, C.intervaloMinutos);
  const abre = paraMin(exp.abre), fecha = paraMin(exp.fecha);
  if (ini < abre || ini + dur > fecha || (ini - abre) % C.intervaloMinutos) return "Esse horário está fora do expediente.";
  if (exp.ultimoHorario && ini > paraMin(exp.ultimoHorario)) return "Esse horário está fora do expediente.";
  if (data === agora.data && ini < agora.minutos + C.antecedenciaMinimaHoras * 60) return "Esse horário já passou ou está muito em cima.";
  if ((C.pausas || []).some((p) => ini >= paraMin(p.inicio) && ini < paraMin(p.fim))) return "Esse horário cai na pausa do salão.";
  return motivoConflito({ hora, duracao, ocupados, bloqueios });
}

/** Diz se o horário bate com um bloqueio ou com outra cliente, ou null se não bate. */
export function motivoConflito({ hora, duracao, ocupados, bloqueios }) {
  const ini = paraMin(hora);
  const dur = Math.max(duracao, C.intervaloMinutos);
  for (const b of bloqueios) {
    if (!b.hora_inicio) return "O Léo não vai atender nesse dia.";
    if (sobrepoe(ini, ini + dur, paraMin(b.hora_inicio), paraMin(b.hora_fim))) return "O Léo não vai atender nesse horário.";
  }
  for (const o of ocupados) {
    const oi = paraMin(o.hora);
    if (sobrepoe(ini, ini + dur, oi, oi + Math.max(o.duracao, C.intervaloMinutos))) return "Esse horário acabou de ser reservado por outra pessoa.";
  }
  return null;
}
