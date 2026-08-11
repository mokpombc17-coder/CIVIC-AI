package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.SessionCookieFactory;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/audit")
public class AdminAuditController {
    private static final UUID SYSTEM_ACTOR = new UUID(0, 0);
    private final JdbcTemplate jdbc;
    private final AdminAuthorizationService authorization;

    public AdminAuditController(JdbcTemplate jdbc, AdminAuthorizationService authorization) {
        this.jdbc = jdbc;
        this.authorization = authorization;
    }

    @GetMapping
    ResponseEntity<AuditPage> list(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId) {
        authorization.requireAdmin(sessionId, false);
        var events = jdbc.query("""
                select id, event_type, actor_user_id, occurred_at
                from audit_events order by occurred_at desc limit 100
                """, (rs, rowNum) -> new AuditEventView(
                rs.getObject("id", UUID.class), rs.getString("event_type"),
                rs.getObject("actor_user_id", UUID.class) == null
                        ? SYSTEM_ACTOR : rs.getObject("actor_user_id", UUID.class),
                rs.getTimestamp("occurred_at").toInstant(), rs.getObject("id", UUID.class).toString()));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(new AuditPage(events));
    }

    record AuditPage(List<AuditEventView> items) {}
    record AuditEventView(UUID eventId, String eventType, UUID actorId, java.time.Instant occurredAt, String requestId) {}
}
