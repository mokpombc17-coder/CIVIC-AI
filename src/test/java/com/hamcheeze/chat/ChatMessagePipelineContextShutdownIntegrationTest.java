package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatCommandResultSender;
import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.delivery.SimpleBrokerChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineState;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class ChatMessagePipelineContextShutdownIntegrationTest {

    @Test
    void contextCloseDrainsBeforeMessagingInfrastructureStops()
            throws Exception {
        ConfigurableApplicationContext context =
                new SpringApplicationBuilder(
                        ChatServerApplication.class,
                        ShutdownTestConfiguration.class)
                        .profiles("local")
                        .web(WebApplicationType.SERVLET)
                        .run(
                                "--server.port=0",
                                "--spring.mongodb.uri="
                                        + MongoRuntimeTestContainer
                                        .replicaSetUrl(),
                                "--chat.message-pipeline.shutdown-drain-timeout-ms=2000");
        ExecutorService closer = Executors.newSingleThreadExecutor();
        ControlledChatMessageStore messageStore =
                context.getBean(ControlledChatMessageStore.class);
        ObservingChatMessagePublisher publisher =
                context.getBean(ObservingChatMessagePublisher.class);
        ChatCommandResultSender resultSender =
                context.getBean(ChatCommandResultSender.class);
        InMemoryChatMessagePipeline pipeline =
                context.getBean(InMemoryChatMessagePipeline.class);
        SmartLifecycle simpleBroker = context.getBean(
                "simpleBrokerMessageHandler",
                SmartLifecycle.class);

        try {
            assertPipelineStopsBeforeMessagingInfrastructure(
                    context,
                    pipeline,
                    simpleBroker);
            List<Boolean> brokerAvailableDuringResultSend =
                    new CopyOnWriteArrayList<>();
            doAnswer(invocation -> {
                brokerAvailableDuringResultSend.add(
                        simpleBroker.isRunning());
                return invocation.callRealMethod();
            }).when(resultSender).send(any(), any(), any());

            assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000")))
                    .isEqualTo(
                            PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
            assertThat(messageStore.firstStarted.await(
                    1, TimeUnit.SECONDS)).isTrue();
            assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440001")))
                    .isEqualTo(
                            PipelineAcceptance.ACCEPTED_FOR_PROCESSING);

            Future<?> close = closer.submit(context::close);

            awaitState(
                    pipeline,
                    PipelineState.STOPPING,
                    Duration.ofSeconds(2));
            assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440012")))
                    .isEqualTo(PipelineAcceptance.UNAVAILABLE);
            assertThat(simpleBroker.isRunning()).isTrue();

            messageStore.releaseFirst.countDown();
            close.get(5, TimeUnit.SECONDS);

            assertThat(pipeline.state())
                    .isEqualTo(PipelineState.STOPPED);
            assertThat(messageStore.inFlightInterrupted).isFalse();
            assertThat(messageStore.size()).isEqualTo(2);
            assertThat(publisher.brokerAvailableDuringPublish)
                    .containsExactly(true, true);
            assertThat(brokerAvailableDuringResultSend)
                    .containsExactly(true, true);
            verify(resultSender, times(2)).send(any(), any(), any());
            assertThat(simpleBroker.isRunning()).isFalse();
        } finally {
            messageStore.releaseFirst.countDown();
            if (context.isActive()) {
                context.close();
            }
            closer.shutdownNow();
        }
    }

    private void assertPipelineStopsBeforeMessagingInfrastructure(
            ConfigurableApplicationContext context,
            InMemoryChatMessagePipeline pipeline,
            SmartLifecycle simpleBroker
    ) {
        SubProtocolWebSocketHandler webSocketHandler =
                context.getBean(SubProtocolWebSocketHandler.class);
        assertThat(pipeline.getPhase())
                .isGreaterThan(simpleBroker.getPhase())
                .isGreaterThan(webSocketHandler.getPhase());
        for (String beanName : List.of(
                "userDestinationMessageHandler",
                "clientInboundChannelExecutor",
                "clientOutboundChannelExecutor",
                "brokerChannelExecutor",
                "chatWebSocketTaskScheduler",
                "messageBrokerTaskScheduler")) {
            SmartLifecycle messagingLifecycle =
                    context.getBean(beanName, SmartLifecycle.class);
            assertThat(pipeline.getPhase())
                    .as("pipeline phase before %s", beanName)
                    .isGreaterThan(messagingLifecycle.getPhase());
        }
    }

    private void awaitState(
            InMemoryChatMessagePipeline pipeline,
            PipelineState expected,
            Duration timeout
    ) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (pipeline.state() != expected
                && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertThat(pipeline.state()).isEqualTo(expected);
    }

    private AdmittedChatCommand command(String clientMessageId) {
        return new AdmittedChatCommand(
                "user-1",
                "connection-1",
                "room-1",
                clientMessageId,
                "hello");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ShutdownTestConfiguration {

        @Bean
        @Primary
        ControlledChatMessageStore controlledChatMessageStore(
                MeterRegistry meterRegistry
        ) {
            return new ControlledChatMessageStore(meterRegistry);
        }

        @Bean
        @Primary
        ObservingChatMessagePublisher observingChatMessagePublisher(
                SimpMessagingTemplate messagingTemplate,
                @Qualifier("simpleBrokerMessageHandler")
                SmartLifecycle simpleBroker,
                MeterRegistry meterRegistry
        ) {
            return new ObservingChatMessagePublisher(
                    messagingTemplate,
                    simpleBroker,
                    meterRegistry);
        }

        @Bean
        static BeanPostProcessor resultSenderSpyPostProcessor() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(
                        Object bean,
                        String beanName
                ) {
                    if (bean instanceof ChatCommandResultSender) {
                        return Mockito.spy(bean);
                    }
                    return bean;
                }
            };
        }
    }

    static final class ControlledChatMessageStore
            implements ChatMessageStore {

        private final InMemoryChatMessageStore delegate;
        private final AtomicInteger attempts = new AtomicInteger();
        private final CountDownLatch firstStarted =
                new CountDownLatch(1);
        private final CountDownLatch releaseFirst =
                new CountDownLatch(1);
        private final AtomicBoolean inFlightInterrupted =
                new AtomicBoolean();

        ControlledChatMessageStore(MeterRegistry meterRegistry) {
            this.delegate = new InMemoryChatMessageStore(
                    Clock.systemUTC(),
                    () -> UUID.randomUUID().toString(),
                    meterRegistry);
        }

        @Override
        public StoreChatMessageResult append(
                NewChatMessage message
        ) {
            if (attempts.incrementAndGet() == 1) {
                firstStarted.countDown();
                try {
                    releaseFirst.await();
                } catch (InterruptedException exception) {
                    inFlightInterrupted.set(true);
                    Thread.currentThread().interrupt();
                }
            }
            return delegate.append(message);
        }

        int size() {
            return delegate.size();
        }
    }

    static final class ObservingChatMessagePublisher
            implements ChatMessagePublisher {

        private final SimpleBrokerChatMessagePublisher delegate;
        private final SmartLifecycle simpleBroker;
        private final List<Boolean> brokerAvailableDuringPublish =
                new CopyOnWriteArrayList<>();

        ObservingChatMessagePublisher(
                SimpMessagingTemplate messagingTemplate,
                SmartLifecycle simpleBroker,
                MeterRegistry meterRegistry
        ) {
            this.delegate = new SimpleBrokerChatMessagePublisher(
                    messagingTemplate,
                    meterRegistry);
            this.simpleBroker = simpleBroker;
        }

        @Override
        public void publish(ChatMessageEventEnvelope event) {
            brokerAvailableDuringPublish.add(
                    simpleBroker.isRunning());
            delegate.publish(event);
        }
    }
}
