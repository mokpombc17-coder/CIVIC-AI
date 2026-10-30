update legal_documents
set active_for_new_signup = false
where document_id in ('TERMS', 'ACCOUNT_RAG_PRIVACY')
  and active_for_new_signup;

insert into legal_documents(
    document_id, document_version, body_sha256, path, active_for_new_signup
) values
    ('TERMS', '2',
     '50dc88e608395e505f81fb14bd1913fb2266447980e5527a87c0fd4d50c9c6ef',
     '/legal/terms/2', true),
    ('ACCOUNT_RAG_PRIVACY', '2',
     '7cdf0bb556745596bd327fab0e891d3224185aff192431d33920b071eae816e3',
     '/legal/required-service-information/2', true);
