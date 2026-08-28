package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.api.dto.BanMemberRequest;
import com.hamcheeze.chat.room.api.dto.CreateRoomRequest;
import com.hamcheeze.chat.room.api.dto.TransferOwnershipRequest;
import com.hamcheeze.chat.room.api.dto.UnbanMemberRequest;
import com.hamcheeze.chat.room.api.dto.UpdateRoomSettingsRequest;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.TransferOwnershipCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.command.UpdateRoomSettingsCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.api.dto.RoomCreationRequestResponse;
import com.hamcheeze.chat.room.creation.RoomCreationRequestService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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
import java.util.List;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1/rooms")
public class RoomCommandController {

    private final RoomCommandService commandService;
    private final RoomCreationRequestService creationRequestService;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomMembershipLimitModeResolver
            membershipLimitModeResolver;
    private final RoomIdempotencyKeyResolver idempotencyKeyResolver;
    private final RoomCommandHttpMapper httpMapper;
    private final RoomCreationRequestHttpMapper
            creationRequestHttpMapper;

    public RoomCommandController(
            RoomCommandService commandService,
            RoomCreationRequestService creationRequestService,
            AuthenticatedUserIdResolver userIdResolver,
            RoomMembershipLimitModeResolver
                    membershipLimitModeResolver,
            RoomIdempotencyKeyResolver idempotencyKeyResolver,
            RoomCommandHttpMapper httpMapper,
            RoomCreationRequestHttpMapper creationRequestHttpMapper
    ) {
        this.commandService = commandService;
        this.creationRequestService = creationRequestService;
        this.userIdResolver = userIdResolver;
        this.membershipLimitModeResolver =
                membershipLimitModeResolver;
        this.idempotencyKeyResolver = idempotencyKeyResolver;
        this.httpMapper = httpMapper;
        this.creationRequestHttpMapper = creationRequestHttpMapper;
    }

    @PostMapping
    public ResponseEntity<RoomCreationRequestResponse> createRoom(
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
        return creationRequestHttpMapper.submission(
                creationRequestService.submit(
                        new CreateRoomCommand(
                                requester,
                                requestId,
                                request.name(),
                                request.description(),
                                List.of(RoomCategory.POLICY),
                                request.visibility(),
                                request.joinPolicy()),
                        membershipLimitModeResolver.resolve(
                                authentication)));
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
        return map(commandService.joinRoom(
                new JoinRoomCommand(
                        userIdResolver.resolve(authentication),
                        idempotencyKeyResolver.resolve(
                                idempotencyKey),
                        RoomApiValidation.roomId(roomId)),
                membershipLimitModeResolver.resolve(
                        authentication)));
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
                        request.targetMembershipId())));
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
                request.targetMembershipId())));
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
                        request.targetMembershipId())));
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

    @PostMapping("/{roomId}/commands/update-settings")
    public ResponseEntity<Object> updateRoomSettings(
            Authentication authentication,
            @RequestHeader(
                    value = RoomIdempotencyKeyResolver.HEADER_NAME,
                    required = false)
            String idempotencyKey,
            @PathVariable String roomId,
            @RequestBody JsonNode body
    ) {
        String validatedRoomId = RoomApiValidation.roomId(roomId);
        String requesterUserId =
                userIdResolver.resolve(authentication);
        String clientRequestId =
                idempotencyKeyResolver.resolve(idempotencyKey);
        UpdateRoomSettingsCommand command;
        try {
            UpdateRoomSettingsRequest request =
                    UpdateRoomSettingsRequest.from(body);
            command = new UpdateRoomSettingsCommand(
                    requesterUserId,
                    clientRequestId,
                    validatedRoomId,
                    request.namePresent(),
                    request.name(),
                    request.descriptionPresent(),
                    request.description(),
                    request.categoriesPresent(),
                    request.categories(),
                    request.visibilityPresent(),
                    request.visibility(),
                    request.joinPolicyPresent(),
                    request.joinPolicy());
        } catch (IllegalArgumentException exception) {
            throw new RoomApiInputException(
                    RoomApiErrorCode.INVALID_REQUEST,
                    HttpStatus.BAD_REQUEST,
                    "The settings patch is invalid.");
        }
        return map(commandService.updateRoomSettings(command));
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
