package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.query.ListedRoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.ListedRoomQueryService;
import com.hamcheeze.chat.room.query.RoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.room.query.RoomQueryService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
public class RoomApiConfiguration {

    @Bean
    AuthenticatedUserIdResolver authenticatedUserIdResolver() {
        return new AuthenticatedUserIdResolver();
    }

    @Bean
    RoomIdempotencyKeyResolver roomIdempotencyKeyResolver() {
        return new RoomIdempotencyKeyResolver();
    }

    @Bean
    RoomCommandHttpMapper roomCommandHttpMapper() {
        return new RoomCommandHttpMapper();
    }

    @Bean
    RoomQueryCursorCodec roomQueryCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new RoomQueryCursorCodec(objectMapper);
    }

    @Bean
    ListedRoomQueryCursorCodec listedRoomQueryCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new ListedRoomQueryCursorCodec(objectMapper);
    }

    @Bean
    ListedRoomQueryService listedRoomQueryService(
            RoomQueryReader reader,
            ListedRoomQueryCursorCodec cursorCodec
    ) {
        return new ListedRoomQueryService(reader, cursorCodec);
    }

    @Bean
    RoomQueryService roomQueryService(
            RoomQueryReader reader,
            RoomQueryCursorCodec cursorCodec
    ) {
        return new RoomQueryService(reader, cursorCodec);
    }

    @Bean
    RoomApiSecurityProblemWriter roomApiSecurityProblemWriter(
            ObjectMapper objectMapper
    ) {
        return new RoomApiSecurityProblemWriter(objectMapper);
    }
}
