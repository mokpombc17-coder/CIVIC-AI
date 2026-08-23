do $migration$
declare
    updated_rows integer;
begin
    update legal_documents as document
    set body_sha256 = published.body_sha256,
        path = published.path
    from (values
        ('TERMS', '1',
         'c6b86097a6d97104129a969f3669e49faa735382ffb2fbd06f93ca993cd2f076',
         '/legal/terms/1'),
        ('ACCOUNT_RAG_PRIVACY', '1',
         'e452368f1c93ba423c16904037a9080b81822974e804afef028457c2265ac78a',
         '/legal/account-rag-privacy/1')
    ) as published(document_id, document_version, body_sha256, path)
    where document.document_id = published.document_id
      and document.document_version = published.document_version;

    get diagnostics updated_rows = row_count;
    if updated_rows <> 2 then
        raise exception 'Expected to publish exactly two signup legal documents, updated %', updated_rows;
    end if;
end
$migration$;
