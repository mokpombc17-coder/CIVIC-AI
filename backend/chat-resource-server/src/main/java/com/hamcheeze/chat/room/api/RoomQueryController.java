package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.api.dto.ActiveRoomResponse;
import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.MembershipResponse;
import com.hamcheeze.chat.room.api.dto.RoomCategorySummaryResponse;
import com.hamcheeze.chat.room.api.dto.RoomDetailResponse;
import com.hamcheeze.chat.room.api.dto.RoomMemberResponse;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.RoomQueryService;
import com.hamcheeze.chat.room.query.model.ActiveRoomView;
import com.hamcheeze.chat.room.query.model.RoomMemberView;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class RoomQueryController {

    private final RoomQueryService queryService;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomCategoryService categoryService;

    public RoomQueryController(
            RoomQueryService queryService,
            AuthenticatedUserIdResolver userIdResolver,
            RoomCategoryService categoryService
    ) {
        this.queryService = queryService;
        this.userIdResolver = userIdResolver;
        this.categoryService = categoryService;
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<RoomDetailResponse> roomDetail(
            Authentication authentication,
            @PathVariable String roomId
    ) {
        var view = queryService.roomDetail(
                userIdResolver.resolve(authentication),
                RoomApiValidation.roomId(roomId));
        var categorySummariesById =
                RoomCategorySummaryResponse.index(
                        categoryService.findAll());
        return noStore(RoomDetailResponse.from(
                view,
                categorySummariesById));
    }

    @GetMapping("/rooms/{roomId}/memberships/me")
    public ResponseEntity<MembershipResponse> myMembership(
            Authentication authentication,
            @PathVariable String roomId
    ) {
        return noStore(MembershipResponse.from(
                queryService.myMembership(
                        userIdResolver.resolve(authentication),
                        RoomApiValidation.roomId(roomId))));
    }

    @GetMapping("/me/rooms")
    public ResponseEntity<CursorPageResponse<ActiveRoomResponse>>
            activeRooms(
                    Authentication authentication,
                    @RequestParam(required = false) String cursor,
                    @RequestParam(required = false) Integer limit
            ) {
        CursorPage<ActiveRoomView> page = queryService.activeRooms(
                userIdResolver.resolve(authentication),
                cursor,
                RoomApiValidation.limit(limit));
        return noStore(new CursorPageResponse<>(
                page.items().stream()
                        .map(ActiveRoomResponse::from)
                        .toList(),
                page.nextCursor(),
                page.hasNext()));
    }

    @GetMapping("/rooms/{roomId}/memberships")
    public ResponseEntity<CursorPageResponse<RoomMemberResponse>>
            roomMembers(
                    Authentication authentication,
                    @PathVariable String roomId,
                    @RequestParam(defaultValue = "ACTIVE")
                    MembershipStatus status,
                    @RequestParam(required = false) String cursor,
                    @RequestParam(required = false) Integer limit
            ) {
        CursorPage<RoomMemberView> page =
                queryService.roomMembers(
                        userIdResolver.resolve(authentication),
                        RoomApiValidation.roomId(roomId),
                        status,
                        cursor,
                        RoomApiValidation.limit(limit));
        return noStore(new CursorPageResponse<>(
                page.items().stream()
                        .map(RoomMemberResponse::from)
                        .toList(),
                page.nextCursor(),
                page.hasNext()));
    }

    private <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(body);
    }
}
