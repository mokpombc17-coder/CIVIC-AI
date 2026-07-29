package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.BanMemberRequest;
import com.hamcheeze.chat.room.api.dto.CreateRoomRequest;
import com.hamcheeze.chat.room.api.dto.TransferOwnershipRequest;
import com.hamcheeze.chat.room.api.dto.UnbanMemberRequest;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.TransferOwnershipCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/rooms")
public class RoomCommandController {

    private final RoomCommandService commandService;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomIdempotencyKeyResolver idempotencyKeyResolver;
    private final RoomCommandHttpMapper httpMapper;

    public RoomCommandController(
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

    @PostMapping
    public ResponseEntity<Object> createRoom(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @Valid @RequestBody CreateRoomRequest request
    ) {
        String requester = userIdResolver.resolve(authentication);
        String requestId =
                idempotencyKeyResolver.resolve(idempotencyKey);
        return map(commandService.createRoom(new CreateRoomCommand(
                requester,
                requestId,
                request.name(),
                request.visibility(),
                request.joinPolicy())));
    }

    @PostMapping("/{roomId}/commands/join")
    public ResponseEntity<Object> joinRoom(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId
    ) {
        return map(commandService.joinRoom(new JoinRoomCommand(
                userIdResolver.resolve(authentication),
                idempotencyKeyResolver.resolve(idempotencyKey),
                RoomApiValidation.roomId(roomId))));
    }

    @PostMapping("/{roomId}/commands/leave")
    public ResponseEntity<Object> leaveRoom(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId
    ) {
        return map(commandService.leaveRoom(new LeaveRoomCommand(
                userIdResolver.resolve(authentication),
                idempotencyKeyResolver.resolve(idempotencyKey),
                RoomApiValidation.roomId(roomId))));
    }

    @PostMapping("/{roomId}/commands/transfer-ownership")
    public ResponseEntity<Object> transferOwnership(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId,
            @Valid @RequestBody TransferOwnershipRequest request
    ) {
        return map(commandService.transferOwnership(
                new TransferOwnershipCommand(
                        userIdResolver.resolve(authentication),
                        idempotencyKeyResolver.resolve(
                                idempotencyKey),
                        RoomApiValidation.roomId(roomId),
                        request.targetUserId())));
    }

    @PostMapping("/{roomId}/commands/ban-member")
    public ResponseEntity<Object> banMember(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId,
            @Valid @RequestBody BanMemberRequest request
    ) {
        return map(commandService.banMember(new BanMemberCommand(
                userIdResolver.resolve(authentication),
                idempotencyKeyResolver.resolve(idempotencyKey),
                RoomApiValidation.roomId(roomId),
                request.targetUserId())));
    }

    @PostMapping("/{roomId}/commands/unban-member")
    public ResponseEntity<Object> unbanMember(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId,
            @Valid @RequestBody UnbanMemberRequest request
    ) {
        return map(commandService.unbanMember(
                new UnbanMemberCommand(
                        userIdResolver.resolve(authentication),
                        idempotencyKeyResolver.resolve(
                                idempotencyKey),
                        RoomApiValidation.roomId(roomId),
                        request.targetUserId())));
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
        return map(commandService.closeRoom(new CloseRoomCommand(
                userIdResolver.resolve(authentication),
                idempotencyKeyResolver.resolve(idempotencyKey),
                RoomApiValidation.roomId(roomId))));
    }

    private ResponseEntity<Object> map(
            RoomCommandExecution execution
    ) {
        URI instance = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .build()
                .toUri();
        return httpMapper.map(execution, instance);
    }
}
