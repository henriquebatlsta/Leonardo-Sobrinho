-- Dias que normalmente estão fechados (ex.: domingo) e o Léo abriu para atender.
-- abre/ultimo/fecha seguem o formato de config.js → horarios (HH:MM).
CREATE TABLE IF NOT EXISTS aberturas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  data      TEXT NOT NULL UNIQUE,
  abre      TEXT NOT NULL,
  ultimo    TEXT NOT NULL,
  fecha     TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
