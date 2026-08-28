package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.AdminRoomCreationRequestResponse;
import com.hamcheeze.chat.room.api.dto.ApproveRoomCreationRequest;
import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.RejectRoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestExecution;
import com.hamcheeze.chat.room.creation.RoomCreationRequestService;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import com.hamcheeze.chat.room.query.CursorPage;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/room-creation-requests")
public class AdminRoomCreationRequestController {

    private final RoomCreationRequestService service;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final AdminRoomCreationRequestHttpMapper httpMapper;

    public AdminRoomCreationRequestController(
            RoomCreationRequestService service,
            AuthenticatedUserIdResolver userIdResolver,
            AdminRoomCreationRequestHttpMapper httpMapper
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
        this.httpMapper = httpMapper;
    }

    @GetMapping
    public ResponseEntity<CursorPageResponse<
            AdminRoomCreationRequestResponse>> requests(
                    Authentication authentication,
                    @RequestParam(
                            defaultValue = "PENDING")
                    RoomCreationRequestStatus status,
                    @RequestParam(required = false) String cursor,
                    @RequestParam(required = false) Integer limit
            ) {
        userIdResolver.resolve(authentication);
        CursorPage<RoomCreationRequest> page = service.findForAdmin(
                status,
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
    public ResponseEntity<AdminRoomCreationRequestResponse> request(
            Authentication authentication,
            @PathVariable String creationRequestId
    ) {
        userIdResolver.resolve(authentication);
        RoomCreationRequestExecution execution =
                service.findForAdmin(creationRequestId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(httpMapper.response(
                        execution.request(),
                        execution.replayed()));
    }

    @PostMapping("/{creationRequestId}/approve")
    public ResponseEntity<AdminRoomCreationRequestResponse> approve(
            Authentication authentication,
            @PathVariable String creationRequestId,
            @Valid @RequestBody ApproveRoomCreationRequest request
    ) {
        return httpMapper.approved(service.approveByAdmin(
                userIdResolver.resolve(authentication),
                creationRequestId,
                request.categoryIds()));
    }

    @PostMapping("/{creationRequestId}/reject")
    public ResponseEntity<AdminRoomCreationRequestResponse> reject(
            Authentication authentication,
            @PathVariable String creationRequestId,
            @Valid @RequestBody RejectRoomCreationRequest request
    ) {
        return httpMapper.rejected(service.rejectByAdmin(
                userIdResolver.resolve(authentication),
                creationRequestId,
                request.reason()));
    }
}
