package com.hamcheeze.chat.websocket.config;

import com.hamcheeze.chat.websocket.authentication.StompJwtAuthenticationInterceptor;
import com.hamcheeze.chat.websocket.authentication.WebSocketAuthenticationHandshakeInterceptor;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionLifecycleInterceptor;
import com.hamcheeze.chat.websocket.connection.TrackingWebSocketHandlerDecoratorFactory;
import com.hamcheeze.chat.websocket.metrics.OutboundMetricsInterceptor;
import com.hamcheeze.chat.websocket.protocol.StompProtocolPolicyInterceptor;
import com.hamcheeze.chat.websocket.protocol.ChatStompErrorHandler;
import com.hamcheeze.chat.websocket.subscription.SubscriptionPolicyInterceptor;
import com.hamcheeze.chat.websocket.subscription.ChatMessageVisibilityOutboundInterceptor;
import com.hamcheeze.chat.websocket.subscription.RoomAccessQuarantineOutboundInterceptor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

@Configuration(proxyBeanMethods = false)
@EnableWebSocketMessageBroker
@EnableConfigurationProperties({
        WebSocketEndpointProperties.class,
        ConnectionLimitProperties.class,
        HeartbeatProperties.class,
        SubscriptionLimitProperties.class,
        ChatAdmissionProperties.class,
        ChatContentProperties.class,
        WebSocketTransportProperties.class
})
public class ChatWebSocketConfig
        implements WebSocketMessageBrokerConfigurer {

    private final WebSocketEndpointProperties endpointProperties;
    private final HeartbeatProperties heartbeatProperties;
    private final ChatContentProperties contentProperties;
    private final WebSocketTransportProperties transportProperties;
    private final ThreadPoolTaskScheduler heartbeatScheduler;
    private final ThreadPoolTaskExecutor outboundExecutor;
    private final TrackingWebSocketHandlerDecoratorFactory trackingDecorator;
    private final WebSocketAuthenticationHandshakeInterceptor
            authenticationHandshakeInterceptor;
    private final StompJwtAuthenticationInterceptor authenticationInterceptor;
    private final StompProtocolPolicyInterceptor protocolInterceptor;
    private final ActiveConnectionLifecycleInterceptor connectionInterceptor;
    private final SubscriptionPolicyInterceptor subscriptionInterceptor;
    private final RoomAccessQuarantineOutboundInterceptor
            roomAccessQuarantineOutboundInterceptor;
    private final ChatMessageVisibilityOutboundInterceptor
            messageVisibilityOutboundInterceptor;
    private final OutboundMetricsInterceptor outboundMetricsInterceptor;
    private final ChatStompErrorHandler stompErrorHandler;

    public ChatWebSocketConfig(
            WebSocketEndpointProperties endpointProperties,
            HeartbeatProperties heartbeatProperties,
            ChatContentProperties contentProperties,
            WebSocketTransportProperties transportProperties,
            @Qualifier("chatWebSocketTaskScheduler")
            ThreadPoolTaskScheduler heartbeatScheduler,
            @Qualifier("chatClientOutboundExecutor")
            ThreadPoolTaskExecutor outboundExecutor,
            TrackingWebSocketHandlerDecoratorFactory trackingDecorator,
            WebSocketAuthenticationHandshakeInterceptor
                    authenticationHandshakeInterceptor,
            StompJwtAuthenticationInterceptor authenticationInterceptor,
            StompProtocolPolicyInterceptor protocolInterceptor,
            ActiveConnectionLifecycleInterceptor connectionInterceptor,
            SubscriptionPolicyInterceptor subscriptionInterceptor,
            RoomAccessQuarantineOutboundInterceptor
                    roomAccessQuarantineOutboundInterceptor,
            ChatMessageVisibilityOutboundInterceptor
                    messageVisibilityOutboundInterceptor,
            OutboundMetricsInterceptor outboundMetricsInterceptor,
            ChatStompErrorHandler stompErrorHandler
    ) {
        this.endpointProperties = endpointProperties;
        this.heartbeatProperties = heartbeatProperties;
        this.contentProperties = contentProperties;
        this.transportProperties = transportProperties;
        this.heartbeatScheduler = heartbeatScheduler;
        this.outboundExecutor = outboundExecutor;
        this.trackingDecorator = trackingDecorator;
        this.authenticationHandshakeInterceptor =
                authenticationHandshakeInterceptor;
        this.authenticationInterceptor = authenticationInterceptor;
        this.protocolInterceptor = protocolInterceptor;
        this.connectionInterceptor = connectionInterceptor;
        this.subscriptionInterceptor = subscriptionInterceptor;
        this.roomAccessQuarantineOutboundInterceptor =
                roomAccessQuarantineOutboundInterceptor;
        this.messageVisibilityOutboundInterceptor =
                messageVisibilityOutboundInterceptor;
        this.outboundMetricsInterceptor = outboundMetricsInterceptor;
        this.stompErrorHandler = stompErrorHandler;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.setErrorHandler(stompErrorHandler);
        registry.setPreserveReceiveOrder(true);
        registry.addEndpoint(endpointProperties.getEndpoint())
                .addInterceptors(authenticationHandshakeInterceptor)
                .setAllowedOriginPatterns(
                        endpointProperties.getAllowedOrigins()
                                .toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        registry.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{
                        heartbeatProperties.getIntervalMs(),
                        heartbeatProperties.getIntervalMs()
                })
                .setTaskScheduler(heartbeatScheduler);
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(
                authenticationInterceptor,
                protocolInterceptor,
                connectionInterceptor,
                subscriptionInterceptor);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.taskExecutor(outboundExecutor);
        registration.interceptors(
                roomAccessQuarantineOutboundInterceptor,
                messageVisibilityOutboundInterceptor,
                outboundMetricsInterceptor);
    }

    @Override
    public void configureWebSocketTransport(
            WebSocketTransportRegistration registration
    ) {
        registration
                .setTimeToFirstMessage(
                        transportProperties.getTimeToFirstMessageMs())
                .setMessageSizeLimit(
                        contentProperties.getMaxStompMessageBytes())
                .setSendBufferSizeLimit(
                        transportProperties
                                .getSendBufferSizeLimitPerConnectionBytes())
                .setSendTimeLimit(
                        transportProperties.getSendTimeLimitPerConnectionMs())
                .addDecoratorFactory(trackingDecorator);
    }
}
