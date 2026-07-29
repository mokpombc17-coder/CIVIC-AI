package com.hamcheeze.chat.websocket.config;

import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.messaging.StompSubProtocolHandler;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("local")
class StompReceiveOrderConfigurationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private SubProtocolWebSocketHandler webSocketHandler;

    @Test
    void preservesInboundStompFrameOrderPerWebSocketSession() {
        assertThat(webSocketHandler.getProtocolHandlers())
                .filteredOn(StompSubProtocolHandler.class::isInstance)
                .singleElement()
                .satisfies(handler -> assertThat(
                        ((StompSubProtocolHandler) handler)
                                .isPreserveReceiveOrder())
                        .isTrue());
    }
}
