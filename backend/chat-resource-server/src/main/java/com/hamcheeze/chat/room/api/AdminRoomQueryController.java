package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.AdminRoomResponse;
import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.RoomCategorySummaryResponse;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.query.AdminRoomQueryCriteria;
import com.hamcheeze.chat.room.query.AdminRoomQueryService;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.model.AdminRoomView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/rooms")
public class AdminRoomQueryController {

    private final AdminRoomQueryService queryService;
    private final AdminRoomQueryCriteriaResolver criteriaResolver;
    private final RoomCategoryService categoryService;
    private final AuthenticatedUserIdResolver userIdResolver;

    public AdminRoomQueryController(
            AdminRoomQueryService queryService,
            AdminRoomQueryCriteriaResolver criteriaResolver,
            RoomCategoryService categoryService,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.queryService = queryService;
        this.criteriaResolver = criteriaResolver;
        this.categoryService = categoryService;
        this.userIdResolver = userIdResolver;
    }

    @GetMapping
    public ResponseEntity<CursorPageResponse<AdminRoomResponse>> rooms(
            Authentication authentication,
            HttpServletRequest request,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit
    ) {
        userIdResolver.resolve(authentication);
        AdminRoomQueryCriteria criteria = criteriaResolver.resolve(request);
        CursorPage<AdminRoomView> page = queryService.rooms(
                criteria,
                cursor,
                RoomApiValidation.limit(limit));
        var categorySummariesById = RoomCategorySummaryResponse.index(
                categoryService.findAll());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CursorPageResponse<>(
                        page.items().stream()
                                .map(item -> AdminRoomResponse.from(
                                        item,
                                        categorySummariesById))
                                .toList(),
                        page.nextCursor(),
                        page.hasNext()));
    }
}
