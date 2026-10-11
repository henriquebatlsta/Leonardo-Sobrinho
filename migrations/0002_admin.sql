-- Conta do dono do salão: entra no painel com o próprio e-mail e senha.
ALTER TABLE clientes ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
