package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/admin/rooms")
public class AdminRoomCommandController {

    private final RoomCommandService commandService;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomIdempotencyKeyResolver idempotencyKeyResolver;
    private final RoomCommandHttpMapper httpMapper;

    public AdminRoomCommandController(
            RoomCommandService commandService,
            AuthenticatedUserIdResolver userIdResolver,
            RoomIdempotencyKeyResolver idempotencyKeyResolver,
            RoomCommandHttpMapper httpMapper
    ) {
        this.commandService = commandService;
        this.userIdResolver = userIdResolver;
        this.idempotencyKeyResolver = idempotencyKeyResolver;
        this.httpMapper = httpMapper;
    }

    @PostMapping("/{roomId}/commands/close")
    public ResponseEntity<Object> closeRoom(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId
    ) {
        return map(commandService.closeRoomAsAdministrator(
                new CloseRoomCommand(
                        userIdResolver.resolve(authentication),
                        idempotencyKeyResolver.resolve(
                                idempotencyKey),
                        RoomApiValidation.roomId(roomId))));
    }

    private ResponseEntity<Object> map(
            RoomCommandExecution execution
    ) {
        URI instance = ServletUriComponentsBuilder
                .fromCurrentRequestUri()
                .build()
                .toUri();
        return httpMapper.map(execution, instance);
    }
}
