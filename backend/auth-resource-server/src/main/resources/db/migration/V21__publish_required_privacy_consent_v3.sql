ALTER TABLE legal_documents
    ADD COLUMN requires_acceptance boolean NOT NULL DEFAULT true;

UPDATE legal_documents
SET requires_acceptance = false
WHERE document_id = 'ACCOUNT_RAG_PRIVACY'
  AND document_version = '2';

UPDATE legal_documents
SET active_for_new_signup = false
WHERE document_id IN ('TERMS', 'ACCOUNT_RAG_PRIVACY')
  AND active_for_new_signup;

INSERT INTO legal_documents(
    document_id,
    document_version,
    body_sha256,
    path,
    active_for_new_signup,
    requires_acceptance
) VALUES
    ('TERMS', '3',
     'bb15f15b01ec758c78664947c64d55337fd9022a9296b5e2e6c5f8181871eb3c',
     '/legal/terms/3', true, true),
    ('ACCOUNT_RAG_PRIVACY', '3',
     'd0d9da07e02f57509838735b4caa37743282feb7489188c5f6bcf9dc3d380dee',
     '/legal/privacy-consent/3', true, true);
