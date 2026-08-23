package ai.civic.mainauth.config;

import java.util.Set;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RuntimeModeGuard implements InitializingBean {
    private static final Set<String> ALLOWED = Set.of("server", "worker");
    private final String mode;

    RuntimeModeGuard(@Value("${civic.runtime.mode}") String mode) {
        this.mode = mode;
    }

    @Override
    public void afterPropertiesSet() {
        if (!ALLOWED.contains(mode)) {
            throw new IllegalStateException("CIVIC_RUNTIME_MODE must be exactly server or worker");
        }
    }
}
