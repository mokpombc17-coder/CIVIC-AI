do $$
begin
    execute format('grant civic_audit_insert_only to %I', current_user);
end
$$;

-- ON CONFLICT(id) DO NOTHING needs SELECT only on its conflict-key column.
-- Payload and actor/subject columns remain unreadable to the sink role.
grant select(id) on audit_events to civic_audit_insert_only;
