package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.RoomReadReceiptStateResponse;
import com.hamcheeze.chat.room.receipt.RoomReadReceiptStateService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms")
public class RoomReadReceiptStateController {

    private final RoomReadReceiptStateService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public RoomReadReceiptStateController(
            RoomReadReceiptStateService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @GetMapping("/{roomId}/read-receipts/state")
    public ResponseEntity<RoomReadReceiptStateResponse> state(
            Authentication authentication,
            @PathVariable String roomId
    ) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(RoomReadReceiptStateResponse.from(
                        service.state(
                                userIdResolver.resolve(authentication),
                                RoomApiValidation.roomId(roomId))));
    }
}
