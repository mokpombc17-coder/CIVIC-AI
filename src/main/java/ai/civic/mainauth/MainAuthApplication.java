package ai.civic.mainauth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.WebApplicationType;

@SpringBootApplication
public class MainAuthApplication {
    public static void main(String[] args) {
        var application = new SpringApplication(MainAuthApplication.class);
        application.setWebApplicationType(webApplicationType(System.getenv("CIVIC_RUNTIME_MODE")));
        application.run(args);
    }

    public static WebApplicationType webApplicationType(String runtimeMode) {
        return "worker".equals(runtimeMode) ? WebApplicationType.NONE : WebApplicationType.SERVLET;
    }
}
