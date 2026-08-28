package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.RoomCategorySummaryResponse;
import com.hamcheeze.chat.room.api.dto.RoomInboxResponse;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.inbox.RoomInboxService;
import com.hamcheeze.chat.room.inbox.model.RoomInboxView;
import com.hamcheeze.chat.room.query.CursorPage;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class RoomInboxController {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 20;

    private final RoomInboxService service;
    private final AuthenticatedUserIdResolver userIdResolver;
    private final RoomCategoryService categoryService;

    public RoomInboxController(
            RoomInboxService service,
            AuthenticatedUserIdResolver userIdResolver,
            RoomCategoryService categoryService
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
        this.categoryService = categoryService;
    }

    @GetMapping("/room-inbox")
    public ResponseEntity<CursorPageResponse<RoomInboxResponse>> inbox(
            Authentication authentication,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit
    ) {
        CursorPage<RoomInboxView> page = service.inbox(
                userIdResolver.resolve(authentication),
                cursor,
                limit(limit));
        var categorySummariesById =
                RoomCategorySummaryResponse.index(
                        categoryService.findAll());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CursorPageResponse<>(
                        page.items().stream()
                                .map(item -> RoomInboxResponse.from(
                                        item,
                                        categorySummariesById))
                                .toList(),
                        page.nextCursor(),
                        page.hasNext()));
    }

    private static int limit(Integer value) {
        int resolved = value == null ? DEFAULT_LIMIT : value;
        if (resolved < 1 || resolved > MAX_LIMIT) {
            throw new RoomApiInputException(
                    RoomApiErrorCode.INVALID_REQUEST,
                    HttpStatus.BAD_REQUEST,
                    "limit must be between 1 and 20");
        }
        return resolved;
    }
}
