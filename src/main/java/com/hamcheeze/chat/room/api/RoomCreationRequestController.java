package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.RoomCreationRequestResponse;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestExecution;
import com.hamcheeze.chat.room.creation.RoomCreationRequestService;
import com.hamcheeze.chat.room.query.CursorPage;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/room-creation-requests")
public class RoomCreationRequestController {

    private final RoomCreationRequestService service;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomCreationRequestHttpMapper httpMapper;

    public RoomCreationRequestController(
            RoomCreationRequestService service,
            AuthenticatedUserIdResolver userIdResolver,
            RoomCreationRequestHttpMapper httpMapper
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
        this.httpMapper = httpMapper;
    }

    @GetMapping
    public ResponseEntity<CursorPageResponse<
            RoomCreationRequestResponse>> ownRequests(
                    Authentication authentication,
                    @RequestParam(required = false) String cursor,
                    @RequestParam(required = false) Integer limit
            ) {
        String requester = userIdResolver.resolve(authentication);
        CursorPage<RoomCreationRequest> page = service.findOwn(
                requester,
                cursor,
                RoomApiValidation.limit(limit));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CursorPageResponse<>(
                        page.items().stream()
                                .map(item -> httpMapper.response(
                                        item,
                                        false))
                                .toList(),
                        page.nextCursor(),
                        page.hasNext()));
    }

    @GetMapping("/{creationRequestId}")
    public ResponseEntity<RoomCreationRequestResponse> ownRequest(
            Authentication authentication,
            @PathVariable String creationRequestId
    ) {
        RoomCreationRequestExecution execution = service.findOwn(
                userIdResolver.resolve(authentication),
                creationRequestId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(httpMapper.response(
                        execution.request(),
                        execution.replayed()));
    }

    @PostMapping("/{creationRequestId}/cancel")
    public ResponseEntity<RoomCreationRequestResponse> cancel(
            Authentication authentication,
            @PathVariable String creationRequestId
    ) {
        return httpMapper.canceled(service.cancelOwn(
                userIdResolver.resolve(authentication),
                creationRequestId));
    }
}
