insert into questionnaire_schemas(version, definition, active_for_new_signup, activated_at)
values (
    1,
    '{"preferred_language":["ko","en"],"rag_answer_detail":["concise","balanced","detailed"]}'::jsonb,
    true,
    now()
);

insert into legal_documents(
    document_id, document_version, body_sha256, path, active_for_new_signup
) values
    ('TERMS', '1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '/terms', true),
    ('ACCOUNT_RAG_PRIVACY', '1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '/privacy', true);
