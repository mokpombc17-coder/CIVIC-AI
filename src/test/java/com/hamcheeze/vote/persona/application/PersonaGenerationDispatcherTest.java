package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.persona.infra.PersonaGenerationMetrics;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

class PersonaGenerationDispatcherTest {

    private ThreadPoolTaskExecutor executor;

    @AfterEach
    void shutdown() {
        if (executor != null) {
            executor.shutdown();
        }
    }

    @Test
    void pollerReturnsBeforeBlockedWorkerAndUsesPersonaThread() throws Exception {
        PersonaGenerationWorker worker = mock(PersonaGenerationWorker.class);
        PersonaGenerationMetrics metrics = mock(PersonaGenerationMetrics.class);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<String> threadName = new AtomicReference<>();
        doAnswer(invocation -> {
            threadName.set(Thread.currentThread().getName());
            entered.countDown();
            release.await(5, TimeUnit.SECONDS);
            return true;
        }).when(worker).executeOne();
        PersonaGenerationProperties properties = properties(1);
        executor = executor(1, 0);
        PersonaGenerationDispatcher dispatcher =
                new PersonaGenerationDispatcher(
                        worker, executor, properties, metrics);

        int submitted = dispatcher.dispatchAvailable();

        assertThat(submitted).isEqualTo(1);
        assertThat(entered.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(threadName.get()).startsWith("persona-worker-test-");
        release.countDown();
    }

    @Test
    void boundedExecutorRejectsWithoutRunningAnotherWorker() throws Exception {
        PersonaGenerationWorker worker = mock(PersonaGenerationWorker.class);
        PersonaGenerationMetrics metrics = mock(PersonaGenerationMetrics.class);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(invocation -> {
            entered.countDown();
            release.await(5, TimeUnit.SECONDS);
            return true;
        }).when(worker).executeOne();
        PersonaGenerationProperties properties = properties(2);
        executor = executor(1, 0);
        PersonaGenerationDispatcher dispatcher =
                new PersonaGenerationDispatcher(
                        worker, executor, properties, metrics);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);
        assertThat(entered.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(dispatcher.dispatchAvailable()).isZero();

        verify(metrics, times(2)).workerRejected();
        release.countDown();
    }

    private static PersonaGenerationProperties properties(int batchSize) {
        PersonaGenerationProperties properties =
                new PersonaGenerationProperties();
        properties.setBatchSize(batchSize);
        return properties;
    }

    private static ThreadPoolTaskExecutor executor(
            int poolSize,
            int queueCapacity
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(poolSize);
        executor.setMaxPoolSize(poolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("persona-worker-test-");
        executor.initialize();
        return executor;
    }
}
