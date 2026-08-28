insert into user_permissions(user_id, permission_id, granted_by)
select bootstrap.id, permission.id, bootstrap.id
from users bootstrap
cross join permissions permission
where bootstrap.normalized_email = lower(btrim('${bootstrap_admin_email}'))
  and bootstrap.origin = 'BOOTSTRAP_ADMIN'
  and permission.code = 'CHAT_ADMIN'
  and exists (
      select 1
      from user_roles active_role
      join roles role on role.id = active_role.role_id
      where active_role.user_id = bootstrap.id
        and active_role.revoked_at is null
        and role.code = 'SUPER_ADMIN'
  )
  and not exists (
      select 1
      from user_permissions active_permission
      where active_permission.user_id = bootstrap.id
        and active_permission.permission_id = permission.id
        and active_permission.revoked_at is null
  );
