package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.CsrfService;
import ai.civic.mainauth.auth.SessionCookieFactory;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
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
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestParam(value = "query", defaultValue = "") String query) {
        authorization.requireAdmin(sessionId, false);
        var normalized = query.strip().toLowerCase(java.util.Locale.ROOT);
        var users = jdbc.query("""
                select u.id, u.email, u.state, u.row_version, c.must_change_password
                from users u join credentials c on c.user_id = u.id
                where ? = '' or u.normalized_email like '%' || ? || '%'
                order by u.created_at desc limit 100
                """, (rs, rowNum) -> view(
                rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("state"),
                rs.getLong("row_version"), rs.getBoolean("must_change_password")), normalized, normalized);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(new UserPage(users));
    }

    @GetMapping("/{userId}")
    ResponseEntity<AdminUserView> get(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @PathVariable UUID userId) {
        authorization.requireAdmin(sessionId, false);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(load(userId));
    }

    @PutMapping("/{userId}/roles")
    AdminUserView replaceRoles(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @PathVariable UUID userId,
            @RequestBody RoleUpdate body,
            HttpServletRequest request) {
        var actor = authorization.requireAdmin(sessionId, true);
        if (!csrf.matches(sessionId, csrfToken)) throw new BrowserRequestRejectedException("CSRF token is invalid");
        browser.requireAuthenticatedMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN), request.getHeader("Sec-Fetch-Site"),
                request.getContentType(), request.getHeader(HttpHeaders.AUTHORIZATION)), csrfToken, csrfToken);
        roles.replaceRoles(actor.userId(), userId, body.rowVersion(), body.roles());
        return load(userId);
    }

    private AdminUserView load(UUID userId) {
        return jdbc.queryForObject("""
                select u.id, u.email, u.state, u.row_version, c.must_change_password
                from users u join credentials c on c.user_id = u.id where u.id = ?
                """, (rs, rowNum) -> view(
                rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("state"),
                rs.getLong("row_version"), rs.getBoolean("must_change_password")), userId);
    }

    private AdminUserView view(UUID id, String email, String state, long version, boolean mustChange) {
        return new AdminUserView(
                id, email, "DEACTIVATED".equals(state) ? "INACTIVE" : state,
                roles.rolesOf(id), version, mustChange);
    }

    record RoleUpdate(Set<String> roles, long rowVersion) {}
    record UserPage(List<AdminUserView> items) {}
    record AdminUserView(
            UUID userId,
            String email,
            String accountState,
            List<String> roles,
            long rowVersion,
            boolean mustChangePassword) {}
}
