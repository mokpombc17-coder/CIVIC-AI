package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.ReadStateRequest;
import com.hamcheeze.chat.room.api.dto.ReadStateResponse;
import com.hamcheeze.chat.room.inbox.RoomReadStateService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms")
public class RoomReadStateController {

    private final RoomReadStateService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public RoomReadStateController(
            RoomReadStateService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @PutMapping("/{roomId}/read-state")
    public ResponseEntity<ReadStateResponse> update(
            Authentication authentication,
            @PathVariable String roomId,
            @Valid @RequestBody ReadStateRequest request
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ReadStateResponse.from(service.update(
                        userIdResolver.resolve(authentication),
                        RoomApiValidation.roomId(roomId),
                        request.throughSequence())));
    }
}
