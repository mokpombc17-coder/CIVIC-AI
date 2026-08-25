package ai.civic.mainauth.admin;

import ai.civic.mainauth.auth.SessionService;
import org.springframework.stereotype.Service;

@Service
public class AdminAuthorizationService {
    private final SessionService sessions;

    public AdminAuthorizationService(SessionService sessions) {
        this.sessions = sessions;
    }

    public SessionService.SessionView requireAdmin(String sessionId, boolean highestOnly) {
        return requireAdmin(sessions.require(sessionId), highestOnly);
    }

    public SessionService.SessionView requireCurrentAdmin(String sessionId, boolean highestOnly) {
        return requireAdmin(sessions.requireForTokenIssuance(sessionId), highestOnly);
    }

    public SessionService.SessionView requireOperator(String sessionId) {
        var session = sessions.require(sessionId);
        if (session.mustChangePassword()) {
            throw new AdminPolicyException("Administrator password rotation is required");
        }
        var operator = session.role() == SessionService.SessionRole.ADMIN
                || session.role() == SessionService.SessionRole.HIGHEST_ADMIN;
        if (!operator) throw new AdminPolicyException("Administrator role is required");
        return session;
    }

    private SessionService.SessionView requireAdmin(
            SessionService.SessionView session, boolean highestOnly) {
        if (session.mustChangePassword()) {
            throw new AdminPolicyException("Administrator password rotation is required");
        }
        var admin = session.role() == SessionService.SessionRole.ADMIN
                || session.role() == SessionService.SessionRole.HIGHEST_ADMIN;
        if (!admin || (highestOnly && session.role() != SessionService.SessionRole.HIGHEST_ADMIN)) {
            throw new AdminPolicyException("Administrator role is required");
        }
        return session;
    }
}
