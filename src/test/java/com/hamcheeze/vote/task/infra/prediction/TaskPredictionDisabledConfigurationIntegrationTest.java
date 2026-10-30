package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionDispatcher;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionApplicationPolicy;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionAvailability;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionMaintenanceScheduler;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionMaintenanceService;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionService;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionStateService;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionWorker;
import com.hamcheeze.vote.task.application.query.TaskPredictionQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
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
        "vote.task.prediction.provider=invalid",
        "vote.task.prediction.base-url=",
        "vote.task.prediction.connect-timeout=0s",
        "vote.task.prediction.request-timeout=0s",
        "vote.task.prediction.processing-lease-duration=0s",
        "vote.task.prediction.retry-delay=0s",
        "vote.task.prediction.dispatcher-delay=0s",
        "vote.task.prediction.lease-reaper-delay=0s",
        "vote.task.prediction.maximum-attempts=0",
        "vote.task.prediction.batch-size=0",
        "vote.task.prediction.worker-pool-size=0",
        "vote.task.prediction.worker-queue-capacity=-1",
        "vote.task.prediction.candidate-policy-version="
})
@ActiveProfiles("test")
class TaskPredictionDisabledConfigurationIntegrationTest {

    @Autowired
    private ApplicationContext context;

    @Test
    void disabledPredictionCreatesNoProviderOrExecutionInfrastructure() {
        assertThat(context.getBeansOfType(TaskPredictionAvailability.class))
                .hasSize(1);
        assertThat(context.getBeansOfType(TaskPredictionService.class))
                .hasSize(1);
        assertThat(context.getBeansOfType(TaskPredictionQueryService.class))
                .hasSize(1);
        assertThat(context.getBeansOfType(TaskSubmissionService.class))
                .hasSize(1);
        assertThat(context.getBeansOfType(PredictionCreationPort.class))
                .isEmpty();
        assertThat(context.getBeansOfType(
                TaskPredictionApplicationPolicy.class)).isEmpty();
        assertThat(context.getBeansOfType(TaskPredictionStateService.class))
                .isEmpty();
        assertThat(context.getBeansOfType(TaskPredictionWorker.class))
                .isEmpty();
        assertThat(context.getBeansOfType(TaskPredictionDispatcher.class))
                .isEmpty();
        assertThat(context.getBeansOfType(
                TaskPredictionMaintenanceService.class)).isEmpty();
        assertThat(context.getBeansOfType(
                TaskPredictionMaintenanceScheduler.class)).isEmpty();
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
