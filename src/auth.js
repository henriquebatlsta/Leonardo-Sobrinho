// Senhas, sessões e cookies. Só Web Crypto, sem bibliotecas.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const tokenAleatorio = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export async function hashSenha(senha, salt = tokenAleatorio(16)) {
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, chave, 256);
  return { hash: hex(bits), salt };
}

// Comparação em tempo constante, para não vazar quantos caracteres batem.
export function iguais(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] || 0) ^ (y[i] || 0);
  return dif === 0;
}

export async function conferirSenha(senha, cliente) {
  const { hash } = await hashSenha(senha, cliente.senha_salt);
  return iguais(hash, cliente.senha_hash);
}

const COOKIE = "ls_sessao";
const DIAS_SESSAO = 60;

export async function criarSessao(env, { clienteId = null, admin = false }) {
  const token = tokenAleatorio();
  const dias = DIAS_SESSAO; // o Léo também fica logado 60 dias, para não ter de entrar toda semana
  const expira = new Date(Date.now() + dias * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessoes (token_hash, cliente_id, admin, expira_em) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), clienteId, admin ? 1 : 0, expira).run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${dias * 86400}`;
}

export const cookieSaida = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function tokenDoPedido(request) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

/** Devolve { tokenHash, cliente_id, admin } da sessão válida, ou null. */
export async function sessaoAtual(env, request) {
  const token = tokenDoPedido(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const s = await env.DB.prepare("SELECT cliente_id, admin, expira_em FROM sessoes WHERE token_hash = ?").bind(tokenHash).first();
  if (!s || s.expira_em < new Date().toISOString()) return null;
  return { tokenHash, cliente_id: s.cliente_id, admin: !!s.admin };
}

export async function encerrarSessao(env, request) {
  const token = tokenDoPedido(request);
  if (token) await env.DB.prepare("DELETE FROM sessoes WHERE token_hash = ?").bind(await sha256(token)).run();
}
