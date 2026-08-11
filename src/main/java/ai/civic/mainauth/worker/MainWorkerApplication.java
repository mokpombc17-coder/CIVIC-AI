package ai.civic.mainauth.worker;

import ai.civic.mainauth.MainAuthApplication;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;

public final class MainWorkerApplication {
    private MainWorkerApplication() {}

    public static void main(String[] args) {
        var application = new SpringApplication(MainAuthApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setDefaultProperties(java.util.Map.of("civic.runtime.mode", "worker"));
        application.run(args);
    }

    static Class<OutboxPoller> pollerType() {
        return OutboxPoller.class;
    }
}
