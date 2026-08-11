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
        var session = sessions.require(sessionId);
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
