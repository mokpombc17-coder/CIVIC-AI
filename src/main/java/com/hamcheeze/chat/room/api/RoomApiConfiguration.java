package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.query.AdminRoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.AdminRoomQueryService;
import com.hamcheeze.chat.room.query.ListedRoomQueryCursorCodec;
import com.hamcheeze.chat.room.inbox.RoomInboxCursorCodec;
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
    RoomMembershipLimitModeResolver
    roomMembershipLimitModeResolver() {
        return new RoomMembershipLimitModeResolver();
    }

    @Bean
    ListedRoomQueryCriteriaResolver
    listedRoomQueryCriteriaResolver() {
        return new ListedRoomQueryCriteriaResolver();
    }

    @Bean
    AdminRoomQueryCriteriaResolver adminRoomQueryCriteriaResolver() {
        return new AdminRoomQueryCriteriaResolver();
    }

    @Bean
    RoomCommandHttpMapper roomCommandHttpMapper() {
        return new RoomCommandHttpMapper();
    }

    @Bean
    RoomCreationRequestHttpMapper roomCreationRequestHttpMapper() {
        return new RoomCreationRequestHttpMapper();
    }

    @Bean
    AdminRoomCreationRequestHttpMapper
    adminRoomCreationRequestHttpMapper() {
        return new AdminRoomCreationRequestHttpMapper();
    }

    @Bean
    RoomQueryCursorCodec roomQueryCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new RoomQueryCursorCodec(objectMapper);
    }

    @Bean
    RoomInboxCursorCodec roomInboxCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new RoomInboxCursorCodec(objectMapper);
    }

    @Bean
    ListedRoomQueryCursorCodec listedRoomQueryCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new ListedRoomQueryCursorCodec(objectMapper);
    }

    @Bean
    AdminRoomQueryCursorCodec adminRoomQueryCursorCodec(
            ObjectMapper objectMapper
    ) {
        return new AdminRoomQueryCursorCodec(objectMapper);
    }

    @Bean
    ListedRoomQueryService listedRoomQueryService(
            RoomQueryReader reader,
            ListedRoomQueryCursorCodec cursorCodec
    ) {
        return new ListedRoomQueryService(reader, cursorCodec);
    }

    @Bean
    AdminRoomQueryService adminRoomQueryService(
            RoomQueryReader reader,
            AdminRoomQueryCursorCodec cursorCodec
    ) {
        return new AdminRoomQueryService(reader, cursorCodec);
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
