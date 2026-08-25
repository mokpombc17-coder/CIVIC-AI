create table permissions (
    id smallserial primary key,
    code varchar(64) not null unique,
    created_at timestamptz not null default now()
);

create table user_permissions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete restrict,
    permission_id smallint not null references permissions(id) on delete restrict,
    granted_by uuid references users(id) on delete restrict,
    granted_at timestamptz not null default now(),
    revoked_at timestamptz,
    row_version bigint not null default 0 check (row_version >= 0)
);

create unique index uq_user_permissions_active
    on user_permissions(user_id, permission_id) where revoked_at is null;

insert into permissions(code) values
    ('RAG_ADMIN'),
    ('CHAT_ADMIN'),
    ('VOTE_ADMIN'),
    ('SIMULATION_ADMIN');

-- RAG_OPERATOR was incorrectly modelled as a role. Preserve the existing
-- access by converting it to the ADMIN role plus the RAG_ADMIN permission.
insert into user_roles(user_id, role_id, granted_by, granted_at)
select distinct ur.user_id, admin_role.id, ur.granted_by, ur.granted_at
from user_roles ur
join roles legacy_role on legacy_role.id = ur.role_id and legacy_role.code = 'RAG_OPERATOR'
cross join roles admin_role
where ur.revoked_at is null
  and admin_role.code = 'ADMIN'
  and not exists (
      select 1 from user_roles active_admin
      where active_admin.user_id = ur.user_id
        and active_admin.role_id = admin_role.id
        and active_admin.revoked_at is null
  );

insert into user_permissions(user_id, permission_id, granted_by, granted_at)
select distinct ur.user_id, permission.id, ur.granted_by, ur.granted_at
from user_roles ur
join roles role on role.id = ur.role_id
cross join permissions permission
where ur.revoked_at is null
  and role.code in ('RAG_OPERATOR', 'ADMIN', 'SUPER_ADMIN')
  and permission.code = 'RAG_ADMIN';

update user_roles
set revoked_at = now()
where revoked_at is null
  and role_id = (select id from roles where code = 'RAG_OPERATOR');
