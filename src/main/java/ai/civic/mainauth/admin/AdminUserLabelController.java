package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.SessionCookieFactory;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/user-labels")
public class AdminUserLabelController {
    private static final int MAX_IDS = 100;
    private final JdbcTemplate jdbc;
    private final AdminAuthorizationService authorization;

    public AdminUserLabelController(JdbcTemplate jdbc, AdminAuthorizationService authorization) {
        this.jdbc = jdbc;
        this.authorization = authorization;
    }

    @GetMapping
    ResponseEntity<UserLabelPage> list(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestParam("ids") List<UUID> ids) {
        authorization.requireOperator(sessionId);
        var uniqueIds = new ArrayList<>(new LinkedHashSet<>(ids));
        if (uniqueIds.size() > MAX_IDS) {
            throw new IllegalArgumentException("At most 100 user labels can be requested");
        }
        if (uniqueIds.isEmpty()) {
            return response(new UserLabelPage(List.of()));
        }
        var placeholders = String.join(",", Collections.nCopies(uniqueIds.size(), "?"));
        var items = jdbc.query(
                "select id, email from users where id in (" + placeholders + ")",
                (rs, rowNum) -> new UserLabel(
                        rs.getObject("id", UUID.class), rs.getString("email")),
                uniqueIds.toArray());
        return response(new UserLabelPage(items));
    }

    private ResponseEntity<UserLabelPage> response(UserLabelPage body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate()).body(body);
    }

    record UserLabelPage(List<UserLabel> items) {}

    record UserLabel(UUID userId, String email) {}
}
