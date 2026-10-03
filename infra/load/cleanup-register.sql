-- Removes the rows created by seed-register.sql (documents LOAD-xxxxx and their revisions).
--   psql "$DATABASE_URL" -f infra/load/cleanup-register.sql
\set ON_ERROR_STOP on
BEGIN;
UPDATE documents SET current_revision_id = NULL, latest_approved_revision_id = NULL
WHERE number LIKE 'LOAD-%';
DELETE FROM document_revisions WHERE document_id IN (SELECT id FROM documents WHERE number LIKE 'LOAD-%');
DELETE FROM documents WHERE number LIKE 'LOAD-%';
COMMIT;
