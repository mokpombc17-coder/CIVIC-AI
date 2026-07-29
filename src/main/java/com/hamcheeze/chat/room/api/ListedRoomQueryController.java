package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.CursorPageResponse;
import com.hamcheeze.chat.room.api.dto.ListedRoomResponse;
import com.hamcheeze.chat.room.query.CursorPage;
import com.hamcheeze.chat.room.query.ListedRoomQueryService;
import com.hamcheeze.chat.room.query.model.ListedRoomView;
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

    public ListedRoomQueryController(
            ListedRoomQueryService queryService
    ) {
        this.queryService = queryService;
    }

    @GetMapping
    public ResponseEntity<CursorPageResponse<ListedRoomResponse>>
            listedRooms(
                    @RequestParam(required = false) String cursor,
                    @RequestParam(required = false) Integer limit
            ) {
        CursorPage<ListedRoomView> page =
                queryService.listedRooms(
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
