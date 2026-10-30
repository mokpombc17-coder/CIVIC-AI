package com.hamcheeze.chat.room.category.api;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.category.api.dto.RoomCategoryListResponse;
import com.hamcheeze.chat.room.category.api.dto.RoomCategoryResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/room-categories")
public class RoomCategoryController {

    private final RoomCategoryService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public RoomCategoryController(
            RoomCategoryService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @GetMapping
    public ResponseEntity<RoomCategoryListResponse> categories(
            Authentication authentication
    ) {
        userIdResolver.resolve(authentication);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new RoomCategoryListResponse(
                        service.findAll().stream()
                                .map(RoomCategoryResponse::from)
                                .toList()));
    }
}
