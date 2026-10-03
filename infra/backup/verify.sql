-- Sanity report after a restore (docs/runbooks/backup-restore.md). Compare with the same query on
-- the source database at backup time; record the result in the runbook's drill log.
\pset footer off
SELECT 'tables' AS item, count(*)::text AS value FROM information_schema.tables WHERE table_schema = 'public'
UNION ALL SELECT 'users', count(*)::text FROM users
UNION ALL SELECT 'clients', count(*)::text FROM clients
UNION ALL SELECT 'projects', count(*)::text FROM projects
UNION ALL SELECT 'documents', count(*)::text FROM documents
UNION ALL SELECT 'document_revisions', count(*)::text FROM document_revisions
UNION ALL SELECT 'file_objects', count(*)::text FROM file_objects
UNION ALL SELECT 'signature_events', count(*)::text FROM signature_events
UNION ALL SELECT 'audit_logs', count(*)::text FROM audit_logs
UNION ALL SELECT 'last audit at', coalesce(max(occurred_at)::text, '-') FROM audit_logs
UNION ALL SELECT 'outbox pending', count(*)::text FROM outbox_events WHERE processed_at IS NULL;
