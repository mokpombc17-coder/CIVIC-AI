package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.AuthCookieFactory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper json;

    public AdminAuditController(
            JdbcTemplate jdbc,
            AdminAuthorizationService authorization,
            ObjectMapper json) {
        this.jdbc = jdbc;
        this.authorization = authorization;
        this.json = json;
    }

    @GetMapping
    ResponseEntity<AuditPage> list(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken) {
        authorization.requireAdmin(accessToken, true);
        var events = jdbc.query("""
                select id, event_type, actor_user_id, subject_user_id, payload::text, occurred_at
                from audit_events order by occurred_at desc limit 100
                """, (rs, rowNum) -> auditView(
                rs.getObject("id", UUID.class),
                rs.getString("event_type"),
                rs.getObject("actor_user_id", UUID.class),
                rs.getObject("subject_user_id", UUID.class),
                rs.getString("payload"),
                rs.getTimestamp("occurred_at").toInstant()));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(new AuditPage(events));
    }

    private AuditEventView auditView(
            UUID eventId,
            String eventType,
            UUID actorId,
            UUID subjectId,
            String payload,
            java.time.Instant occurredAt) {
        try {
            var node = json.readTree(payload);
            return new AuditEventView(
                    eventId,
                    eventType,
                    actorId == null ? SYSTEM_ACTOR : actorId,
                    subjectId,
                    stringList(node.get("before_roles")),
                    stringList(node.get("after_roles")),
                    stringList(node.get("before_permissions")),
                    stringList(node.get("after_permissions")),
                    text(node.get("reason")),
                    occurredAt,
                    eventId.toString());
        } catch (Exception exception) {
            throw new IllegalStateException("Could not read redacted audit payload", exception);
        }
    }

    private List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        var values = new java.util.ArrayList<String>();
        node.forEach(value -> values.add(value.asText()));
        return List.copyOf(values);
    }

    private String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    record AuditPage(List<AuditEventView> items) {}
    record AuditEventView(
            UUID eventId,
            String eventType,
            UUID actorId,
            UUID subjectId,
            List<String> beforeRoles,
            List<String> afterRoles,
            List<String> beforePermissions,
            List<String> afterPermissions,
            String reason,
            java.time.Instant occurredAt,
            String requestId) {}
}
