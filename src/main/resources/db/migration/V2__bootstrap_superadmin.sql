insert into roles(code, highest_admin) values
    ('PARTICIPANT', false),
    ('RAG_OPERATOR', false),
    ('ADMIN', false),
    ('SUPER_ADMIN', true);

with created_user as (
    insert into users(email, normalized_email, origin, state, email_verified_at)
    values (
        '${bootstrap_admin_email}',
        lower(btrim('${bootstrap_admin_email}')),
        'BOOTSTRAP_ADMIN',
        'ACTIVE',
        now()
    )
    returning id
), created_credential as (
    insert into credentials(user_id, password_hash, must_change_password)
    select id, '${bootstrap_admin_password_hash}', true from created_user
    returning user_id
)
insert into user_roles(user_id, role_id, granted_by)
select created_credential.user_id, roles.id, created_credential.user_id
from created_credential cross join roles
where roles.code = 'SUPER_ADMIN';

insert into feature_gates(gate_key, enabled, description) values
    ('rag.enabled', true, 'RAG API availability'),
    ('chat.enabled', false, 'Chat is deferred'),
    ('decision.enabled', false, 'Decision and vote are deferred');
