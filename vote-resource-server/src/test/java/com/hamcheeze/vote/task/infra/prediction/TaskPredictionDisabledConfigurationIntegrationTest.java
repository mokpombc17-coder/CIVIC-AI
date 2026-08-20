package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionDispatcher;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionMaintenanceService;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionWorker;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

@Import({
        TestcontainersConfiguration.class,
        TaskPredictionDisabledConfigurationIntegrationTest
                .JwtTestConfiguration.class
})
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false",
        "vote.task.prediction.base-url="
})
@ActiveProfiles("test")
class TaskPredictionDisabledConfigurationIntegrationTest {

    @Autowired
    private ApplicationContext context;

    @Test
    void disabledPredictionCreatesNoProviderOrExecutionInfrastructure() {
        assertThat(context.getBeansOfType(PredictionCreationPort.class))
                .isEmpty();
        assertThat(context.getBeansOfType(TaskPredictionWorker.class))
                .isEmpty();
        assertThat(context.getBeansOfType(TaskPredictionDispatcher.class))
                .isEmpty();
        assertThat(context.getBeansOfType(
                TaskPredictionMaintenanceService.class)).isEmpty();
        assertThat(context.containsBean("taskPredictionExecutor")).isFalse();
        assertThat(context.containsBean("taskPredictionTaskScheduler"))
                .isFalse();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class JwtTestConfiguration {

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
