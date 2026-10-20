package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.AuthCookieFactory;
import ai.civic.mainauth.auth.CsrfService;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {
    static final int DEFAULT_PAGE_SIZE = 100;
    static final int MAX_PAGE_SIZE = 200;
    private final JdbcTemplate jdbc;
    private final AdminAuthorizationService authorization;
    private final AdminRoleService roles;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browser;

    public AdminUserController(
            JdbcTemplate jdbc,
            AdminAuthorizationService authorization,
            AdminRoleService roles,
            CsrfService csrf,
            BrowserRequestPolicy browser) {
        this.jdbc = jdbc;
        this.authorization = authorization;
        this.roles = roles;
        this.csrf = csrf;
        this.browser = browser;
    }

    @GetMapping
    ResponseEntity<UserPage> list(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestParam(value = "query", defaultValue = "") String query,
            @RequestParam(value = "status", defaultValue = "all") String status,
            @RequestParam(value = "limit", defaultValue = "" + DEFAULT_PAGE_SIZE) int limit,
            @RequestParam(value = "cursor", required = false) String cursor) {
        authorization.requireAdmin(accessToken, true);
        if (limit < 1 || limit > MAX_PAGE_SIZE) {
            throw new AdminRequestValidationException("limit must be between 1 and " + MAX_PAGE_SIZE);
        }
        var normalized = query.strip().toLowerCase(java.util.Locale.ROOT);
        var filter = new StringBuilder("(? = '' or u.normalized_email like '%' || ? || '%')")
                .append(" and ").append(statusCondition(status));
        var filterArgs = List.<Object>of(normalized, normalized);

        var total = jdbc.queryForObject(
                "select count(*) from users u where " + filter, Long.class, filterArgs.toArray());

        var pageArgs = new ArrayList<Object>(filterArgs);
        var pageFilter = new StringBuilder(filter);
        if (cursor != null && !cursor.isBlank()) {
            var position = UserCursor.decode(cursor);
            pageFilter.append(" and (u.created_at, u.id) < (?, ?)");
            pageArgs.add(position.createdAt().atOffset(ZoneOffset.UTC));
            pageArgs.add(position.userId());
        }
        pageArgs.add(limit + 1);
        var rows = jdbc.query("""
                select u.id, u.email, u.state, u.row_version, u.created_at, c.must_change_password,
                       u.email_verified_at, coalesce(max(t.last_used_at), u.updated_at) as last_activity_at
                from users u join credentials c on c.user_id = u.id
                left join refresh_tokens t on t.user_id = u.id
                where %s
                group by u.id, c.must_change_password
                order by u.created_at desc, u.id desc limit ?
                """.formatted(pageFilter), (rs, rowNum) -> new PageRow(
                new UserCursor(rs.getTimestamp("created_at").toInstant(), rs.getObject("id", UUID.class)),
                view(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("state"),
                        rs.getLong("row_version"), rs.getBoolean("must_change_password"),
                        rs.getTimestamp("email_verified_at"), rs.getTimestamp("last_activity_at"))),
                pageArgs.toArray());
        var hasMore = rows.size() > limit;
        var page = hasMore ? rows.subList(0, limit) : rows;
        var nextCursor = hasMore ? page.getLast().position().encode() : null;
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(new UserPage(
                page.stream().map(PageRow::user).toList(), total == null ? 0 : total, nextCursor));
    }

    private static String statusCondition(String status) {
        return switch (status) {
            case "all" -> "true";
            case "active" -> "u.state = 'ACTIVE'";
            case "inactive" -> "u.state <> 'ACTIVE'";
            case "admin" -> """
                    exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                            where ur.user_id = u.id and ur.revoked_at is null
                              and r.code in ('ADMIN', 'SUPER_ADMIN'))""";
            default -> throw new AdminRequestValidationException(
                    "status must be one of all, active, inactive, admin");
        };
    }

    @GetMapping("/{userId}")
    ResponseEntity<AdminUserView> get(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @PathVariable UUID userId) {
        authorization.requireAdmin(accessToken, true);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(load(userId));
    }

    @PutMapping("/{userId}/roles")
    AdminUserView replaceRoles(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @PathVariable UUID userId,
            @RequestBody RoleUpdate body,
            HttpServletRequest request) {
        var actor = authorization.requireAdmin(accessToken, true);
        if (!csrf.matches(actor, csrfToken)) throw new BrowserRequestRejectedException("CSRF token is invalid");
        browser.requireAuthenticatedMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN), request.getHeader("Sec-Fetch-Site"),
                request.getContentType(), request.getHeader(HttpHeaders.AUTHORIZATION)), csrfToken, csrfToken);
        roles.replaceRolesAuthorized(
                accessToken,
                userId,
                body.rowVersion(),
                body.roles(),
                body.permissions(),
                body.reason(),
                body.impactConfirmed());
        return load(userId);
    }

    private AdminUserView load(UUID userId) {
        var users = jdbc.query("""
                select u.id, u.email, u.state, u.row_version, c.must_change_password,
                       u.email_verified_at, coalesce(max(t.last_used_at), u.updated_at) as last_activity_at
                from users u join credentials c on c.user_id = u.id
                left join refresh_tokens t on t.user_id = u.id
                where u.id = ? group by u.id, c.must_change_password
                """, (rs, rowNum) -> view(
                rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("state"),
                rs.getLong("row_version"), rs.getBoolean("must_change_password"),
                rs.getTimestamp("email_verified_at"), rs.getTimestamp("last_activity_at")), userId);
        if (users.size() != 1) throw new AdminUserNotFoundException();
        return users.getFirst();
    }

    private AdminUserView view(
            UUID id,
            String email,
            String state,
            long version,
            boolean mustChange,
            java.sql.Timestamp emailVerifiedAt,
            java.sql.Timestamp lastActivityAt) {
        return new AdminUserView(
                id, email, "DEACTIVATED".equals(state) ? "INACTIVE" : state,
                roles.rolesOf(id), roles.permissionsOf(id), version, mustChange,
                emailVerifiedAt == null ? null : emailVerifiedAt.toInstant(),
                lastActivityAt == null ? null : lastActivityAt.toInstant());
    }

    record RoleUpdate(
            Set<String> roles,
            Set<String> permissions,
            long rowVersion,
            String reason,
            boolean impactConfirmed) {}
    record UserPage(List<AdminUserView> items, long total, String nextCursor) {}

    private record PageRow(UserCursor position, AdminUserView user) {}

    /** Opaque keyset position: the (created_at, id) of the last row on a page. */
    record UserCursor(Instant createdAt, UUID userId) {
        String encode() {
            var raw = createdAt.toString() + "|" + userId;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
        }

        static UserCursor decode(String cursor) {
            try {
                var raw = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
                var separator = raw.indexOf('|');
                if (separator < 0) throw new IllegalArgumentException("missing separator");
                return new UserCursor(
                        Instant.parse(raw.substring(0, separator)), UUID.fromString(raw.substring(separator + 1)));
            } catch (IllegalArgumentException | java.time.format.DateTimeParseException exception) {
                throw new AdminRequestValidationException("cursor is invalid");
            }
        }
    }
    record AdminUserView(
            UUID userId,
            String email,
            String accountState,
            List<String> roles,
            List<String> permissions,
            long rowVersion,
            boolean mustChangePassword,
            Instant emailVerifiedAt,
            Instant lastActivityAt) {}
}
