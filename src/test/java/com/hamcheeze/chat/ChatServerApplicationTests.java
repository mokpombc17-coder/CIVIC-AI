package com.hamcheeze.chat;

import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.room.creation.RoomCreationMode;
import com.hamcheeze.chat.room.creation.RoomCreationProperties;
import com.hamcheeze.chat.websocket.config.WebSocketTransportProperties;
import com.hamcheeze.chat.websocket.health.ChatPipelineHealthIndicator;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.health.contributor.Status;
import org.springframework.context.ApplicationContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("local")
class ChatServerApplicationTests
		extends MongoRuntimeIntegrationTest {

	@Autowired
	private ApplicationContext applicationContext;

	@Autowired
	private WebSocketTransportProperties transportProperties;

	@Autowired
	private ChatPipelineHealthIndicator chatPipelineHealth;

	@Autowired
	private MeterRegistry meterRegistry;

	@Autowired
	private RoomCreationProperties roomCreationProperties;

	@Autowired
	@Qualifier("chatClientOutboundExecutor")
	private ThreadPoolTaskExecutor outboundExecutor;

	@Test
	void contextLoads() {
		assertThat(roomCreationProperties.mode())
				.isEqualTo(RoomCreationMode.DIRECT);
		assertThat(roomCreationProperties.maxPendingRequestsPerUser())
				.isEqualTo(3);
		assertThat(transportProperties.getTimeToFirstMessageMs())
				.isEqualTo(10_000);

		SubProtocolWebSocketHandler handler =
				(SubProtocolWebSocketHandler) applicationContext.getBean(
						"subProtocolWebSocketHandler");
		assertThat(handler.getTimeToFirstMessage()).isEqualTo(10_000);
		assertThat(handler.getSendBufferSizeLimit()).isEqualTo(262_144);
		assertThat(handler.getSendTimeLimit()).isEqualTo(10_000);

		assertThat(chatPipelineHealth.health().getStatus())
				.isEqualTo(Status.UP);
		assertThat(meterRegistry.find(
				"client_outbound_channel.queue_size").gauge().value())
				.isEqualTo(
						outboundExecutor.getThreadPoolExecutor()
								.getQueue()
								.size());
		assertThat(meterRegistry.find(
				"websocket.send_limit_exceeded").gauge().value())
				.isEqualTo(handler.getStats().getLimitExceededSessions());
		assertThat(meterRegistry.find(
				"websocket.transport_errors").gauge().value())
				.isEqualTo(handler.getStats().getTransportErrorSessions());
	}

}
