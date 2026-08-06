package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.ListedRoomResponse;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.ListedRoomQueryCriteria;
import com.hamcheeze.chat.room.query.ListedRoomQueryService;
import com.hamcheeze.chat.room.query.model.ListedRoomView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms")
public class ListedRoomQueryController {

    private final ListedRoomQueryService queryService;
    private final ListedRoomQueryCriteriaResolver criteriaResolver;

    public ListedRoomQueryController(
            ListedRoomQueryService queryService,
            ListedRoomQueryCriteriaResolver criteriaResolver
    ) {
        this.queryService = queryService;
        this.criteriaResolver = criteriaResolver;
    }

    @GetMapping
    public ResponseEntity<CursorPageResponse<ListedRoomResponse>>
            listedRooms(
                    HttpServletRequest request,
                    @RequestParam(required = false) String cursor,
                    @RequestParam(required = false) Integer limit
            ) {
        ListedRoomQueryCriteria criteria =
                criteriaResolver.resolve(request);
        CursorPage<ListedRoomView> page =
                queryService.listedRooms(
                        criteria,
                        cursor,
                        RoomApiValidation.limit(limit));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new CursorPageResponse<>(
                        page.items().stream()
                                .map(ListedRoomResponse::from)
                                .toList(),
                        page.nextCursor(),
                        page.hasNext()));
    }
}
