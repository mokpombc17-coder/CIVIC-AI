package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.TestcontainersConfiguration;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false"
})
@ActiveProfiles({"local", "test"})
class TaskPredictionTransactionCallbacksIntegrationTest {

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void counterRunsOnlyAfterSuccessfulTransactionCommit() {
        Counter counter = new SimpleMeterRegistry().counter(
                "test.task.prediction.transaction.counter");
        TransactionTemplate transaction = new TransactionTemplate(
                transactionManager);

        transaction.executeWithoutResult(status -> {
            TaskPredictionTransactionCallbacks.afterCommit(
                    counter::increment);
            status.setRollbackOnly();
        });
        assertThat(counter.count()).isZero();

        transaction.executeWithoutResult(status ->
                TaskPredictionTransactionCallbacks.afterCommit(
                        counter::increment));
        assertThat(counter.count()).isEqualTo(1D);
    }

    @Test
    void callbackFailureIsBestEffortInsideAndOutsideTransaction() {
        TransactionTemplate transaction = new TransactionTemplate(
                transactionManager);

        assertThatCode(() -> transaction.executeWithoutResult(status ->
                TaskPredictionTransactionCallbacks.afterCommit(
                        "test-transaction-callback-failure",
                        () -> {
                            throw new IllegalStateException(
                                    "metric unavailable");
                        })))
                .doesNotThrowAnyException();
        assertThatCode(() -> TaskPredictionTransactionCallbacks.afterCommit(
                "test-immediate-callback-failure",
                () -> {
                    throw new IllegalStateException("metric unavailable");
                }))
                .doesNotThrowAnyException();
    }
}
