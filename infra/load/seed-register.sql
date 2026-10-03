-- P1-15 load test data: a document register of 5,000 rows (docs/09-nfr.md §1–2) in one project,
-- each document with 1–3 revisions so list filters on the current revision have work to do.
-- Never run against production. Re-running adds nothing (numbers LOAD-xxxxx are unique).
--
--   psql "$DATABASE_URL" -v project_code=P26-001 -v owner_email=admin@example.co.th \
--        -f infra/load/seed-register.sql
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE load_ctx AS
SELECT
  (SELECT id FROM projects WHERE code = :'project_code') AS project_id,
  (SELECT id FROM users WHERE email = :'owner_email') AS owner_id,
  (SELECT array_agg(id ORDER BY sort_order) FROM disciplines WHERE is_active) AS disciplines,
  (SELECT array_agg(id ORDER BY sort_order) FROM document_types WHERE is_active) AS types;

DO $$
BEGIN
  IF (SELECT project_id FROM load_ctx) IS NULL OR (SELECT owner_id FROM load_ctx) IS NULL THEN
    RAISE EXCEPTION 'project_code or owner_email not found';
  END IF;
END $$;

INSERT INTO documents (
  id, project_id, number, title, discipline_id, document_type_id, status, confidentiality,
  owner_id, tags, created_by_id, created_at, updated_at, version
)
SELECT
  gen_random_uuid(),
  c.project_id,
  'LOAD-' || lpad(g::text, 5, '0'),
  (ARRAY['ผังบ่อเติมอากาศ', 'แบบท่อน้ำดิบ', 'รายการคำนวณถังตกตะกอน', 'รายงานออกแบบระบบสูบ',
         'แบบโครงสร้างอาคารควบคุม', 'แบบไฟฟ้าตู้ MCC'])[1 + g % 6] || ' ชุดที่ ' || g,
  c.disciplines[1 + g % array_length(c.disciplines, 1)],
  c.types[1 + g % array_length(c.types, 1)],
  (ARRAY['ACTIVE', 'ACTIVE', 'ACTIVE', 'ON_HOLD'])[1 + g % 4]::"DocumentStatus",
  'CLIENT_SHAREABLE'::"Confidentiality",
  c.owner_id,
  ARRAY['load'],
  c.owner_id,
  now() - (g || ' minutes')::interval,
  now() - (g || ' minutes')::interval,
  1
FROM load_ctx c, generate_series(1, 5000) AS g
ON CONFLICT (number) DO NOTHING;

-- revisions: 0 (approved), A (in review / draft) for some
INSERT INTO document_revisions (
  id, document_id, rev_label, rev_index, purpose_code, status, prepared_by_id, approved_at,
  created_by_id, created_at, updated_at, version
)
SELECT gen_random_uuid(), d.id, r.label, r.idx, r.purpose::"PurposeCode", r.status::"RevisionStatus",
       c.owner_id, CASE WHEN r.status = 'APPROVED' THEN now() END, c.owner_id, now(), now(), 1
FROM documents d
CROSS JOIN load_ctx c
CROSS JOIN LATERAL (
  VALUES ('A', 1, 'FA', CASE WHEN right(d.number, 1) IN ('0', '5') THEN 'IN_REVIEW' ELSE 'APPROVED' END),
         ('B', 2, 'FC', 'DRAFT')
) AS r(label, idx, purpose, status)
WHERE d.number LIKE 'LOAD-%'
  AND (r.idx = 1 OR right(d.number, 1) IN ('1', '2', '3'))
  AND NOT EXISTS (SELECT 1 FROM document_revisions x WHERE x.document_id = d.id);

UPDATE documents d SET
  current_revision_id = (SELECT id FROM document_revisions r WHERE r.document_id = d.id ORDER BY rev_index DESC LIMIT 1),
  latest_approved_revision_id = (SELECT id FROM document_revisions r WHERE r.document_id = d.id AND r.status = 'APPROVED' ORDER BY rev_index DESC LIMIT 1)
WHERE d.number LIKE 'LOAD-%' AND d.current_revision_id IS NULL;

ANALYZE documents;
ANALYZE document_revisions;

COMMIT;

SELECT count(*) AS load_documents FROM documents WHERE number LIKE 'LOAD-%';
