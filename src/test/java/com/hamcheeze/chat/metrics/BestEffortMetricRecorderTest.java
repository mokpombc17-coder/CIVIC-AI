package com.hamcheeze.chat.metrics;

import io.micrometer.core.instrument.Counter;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

class BestEffortMetricRecorderTest {

    @Test
    void isolatesCounterAndTimerRuntimeFailures() {
        assertThatCode(() -> BestEffortMetricRecorder.increment(
                "test.counter",
                ThrowingMeterRegistry.throwingCounter()))
                .doesNotThrowAnyException();

        assertThatCode(() -> BestEffortMetricRecorder.increment(
                "test.counter.amount",
                ThrowingMeterRegistry.throwingCounter(),
                2))
                .doesNotThrowAnyException();

        assertThatCode(() -> BestEffortMetricRecorder.record(
                "test.timer",
                ThrowingMeterRegistry.throwingTimer(),
                Duration.ofMillis(1)))
                .doesNotThrowAnyException();
    }

    @Test
    void doesNotSwallowErrors() {
        Counter counter = mock(Counter.class);
        doThrow(new AssertionError("fatal metric failure"))
                .when(counter).increment();

        assertThatThrownBy(() -> BestEffortMetricRecorder.increment(
                "test.counter",
                counter))
                .isInstanceOf(AssertionError.class)
                .hasMessage("fatal metric failure");
    }
}
