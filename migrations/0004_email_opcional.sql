-- Cadastro só com WhatsApp: o e-mail passa a ser opcional (NULL).
-- O SQLite não tira NOT NULL de uma coluna, então a tabela é refeita.
-- Quem já tem e-mail continua com ele.

PRAGMA defer_foreign_keys = true;

-- Apagar a tabela antiga apagaria em cascata as sessões e os pedidos de nova
-- senha (ON DELETE CASCADE). Guarda uma cópia e devolve no fim, para ninguém
-- ser deslogado.
CREATE TABLE sessoes_copia AS SELECT * FROM sessoes;
CREATE TABLE redefinicoes_copia AS SELECT * FROM redefinicoes;

CREATE TABLE clientes_nova (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  email       TEXT UNIQUE COLLATE NOCASE,
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
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  admin       INTEGER NOT NULL DEFAULT 0
);

INSERT INTO clientes_nova (id, nome, email, whatsapp, senha_hash, senha_salt, cep, rua, numero, complemento, bairro, cidade, uf, criado_em, admin)
  SELECT id, nome, NULLIF(email, ''), whatsapp, senha_hash, senha_salt, cep, rua, numero, complemento, bairro, cidade, uf, criado_em, admin
  FROM clientes;

DROP TABLE clientes;
ALTER TABLE clientes_nova RENAME TO clientes;

INSERT OR IGNORE INTO sessoes SELECT * FROM sessoes_copia;
INSERT OR IGNORE INTO redefinicoes SELECT * FROM redefinicoes_copia;
DROP TABLE sessoes_copia;
DROP TABLE redefinicoes_copia;

-- O login agora é pelo WhatsApp.
CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp);

PRAGMA defer_foreign_keys = false;
