-- Clientes cadastradas (o endereço já fica pronto para a futura loja).
CREATE TABLE IF NOT EXISTS clientes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  whatsapp    TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,
  senha_salt  TEXT NOT NULL,
  cep         TEXT NOT NULL DEFAULT '',
  rua         TEXT NOT NULL DEFAULT '',
  numero      TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro      TEXT NOT NULL DEFAULT '',
  cidade      TEXT NOT NULL DEFAULT '',
  uf          TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessões de login. Guardamos só o hash do token do cookie.
-- cliente_id NULL + admin = 1 é a sessão do painel do Léo.
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  admin      INTEGER NOT NULL DEFAULT 0,
  expira_em  TEXT NOT NULL
);

-- status: pendente (cliente marcou) → confirmado (Léo confirmou) | cancelado.
-- data no formato AAAA-MM-DD e hora HH:MM, sempre no horário de Brasília.
CREATE TABLE IF NOT EXISTS agendamentos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id),
  data              TEXT NOT NULL,
  hora              TEXT NOT NULL,
  duracao           INTEGER NOT NULL,
  servicos          TEXT NOT NULL,
  preco             INTEGER NOT NULL,
  obs               TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'pendente',
  motivo_cancelado  TEXT NOT NULL DEFAULT '',
  cliente_confirmou INTEGER NOT NULL DEFAULT 0,
  lembrete_enviado  INTEGER NOT NULL DEFAULT 0,
  token             TEXT NOT NULL,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);

-- Dias (ou trechos de um dia) em que o Léo não atende.
-- hora_inicio/hora_fim vazios = o dia inteiro.
CREATE TABLE IF NOT EXISTS bloqueios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data        TEXT NOT NULL,
  hora_inicio TEXT NOT NULL DEFAULT '',
  hora_fim    TEXT NOT NULL DEFAULT '',
  motivo      TEXT NOT NULL DEFAULT '',
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bloqueios_data ON bloqueios(data);

-- Pedidos de "esqueci minha senha".
CREATE TABLE IF NOT EXISTS redefinicoes (
  token_hash TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  expira_em  TEXT NOT NULL
);
