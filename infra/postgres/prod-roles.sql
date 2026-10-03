-- Production database roles (docs/06-security.md §9, checklist docs/runbooks/security-checklist.md).
-- wems_owner owns the schema and runs `prisma migrate deploy`; the API and worker connect as
-- wems_app, which cannot alter the schema and can only INSERT/SELECT the audit trail.
-- Run once as a superuser after the first migration, and again after migrations that add tables
-- (the default privileges cover tables created later by wems_owner).
--
--   psql "$SUPERUSER_URL" -v app_password="'…'" -f infra/postgres/prod-roles.sql
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wems_app') THEN
    CREATE ROLE wems_app LOGIN;
  END IF;
END $$;
ALTER ROLE wems_app PASSWORD :app_password;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO wems_app', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO wems_app;
REVOKE CREATE ON SCHEMA public FROM wems_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wems_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wems_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wems_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wems_app;
ALTER DEFAULT PRIVILEGES FOR ROLE wems_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO wems_app;

-- append-only audit trail
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM wems_app;
-- signatures are evidence too
REVOKE UPDATE, DELETE, TRUNCATE ON signature_events FROM wems_app;

-- the migrations table is for wems_owner only
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON _prisma_migrations FROM wems_app;
  END IF;
END $$;
