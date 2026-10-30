create index notification_outbox_pending_poll_idx
    on notification_outbox(created_at, available_at)
    where delivered_at is null;
