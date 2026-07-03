-- Adds the BCB (Banco Central do Brasil / SGS API) data source.
-- Enum values cannot be dropped in PostgreSQL: this migration is irreversible by design.
ALTER TYPE "DataSource" ADD VALUE 'BCB';
