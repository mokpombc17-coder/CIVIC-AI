package ai.civic.mainauth.worker;

import ai.civic.mainauth.MainAuthApplication;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

public final class MainWorkerApplication {
    private MainWorkerApplication() {}

    public static void main(String[] args) {
        var application = new SpringApplication(MainAuthApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.addInitializers(context -> forceWorkerMode(context.getEnvironment()));
        application.run(args);
    }

    static void forceWorkerMode(ConfigurableEnvironment environment) {
        environment.getPropertySources().addFirst(new MapPropertySource(
                "civicWorkerRuntimeMode", Map.of("civic.runtime.mode", "worker")));
    }

    static Class<OutboxPoller> pollerType() {
        return OutboxPoller.class;
    }
}
