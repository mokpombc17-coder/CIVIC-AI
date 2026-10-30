package com.hamcheeze.chat.room.category.api;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.category.api.dto.ReplaceRoomCategoriesRequest;
import com.hamcheeze.chat.room.category.api.dto.RoomCategoryAssignmentResponse;
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
@RequestMapping("/api/v1/admin/rooms")
public class AdminRoomCategoryAssignmentController {

    private final RoomCategoryService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public AdminRoomCategoryAssignmentController(
            RoomCategoryService service,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.service = service;
        this.userIdResolver = userIdResolver;
    }

    @PutMapping("/{roomId}/categories")
    public ResponseEntity<RoomCategoryAssignmentResponse>
    replaceCategories(
            Authentication authentication,
            @PathVariable String roomId,
            @Valid @RequestBody ReplaceRoomCategoriesRequest request
    ) {
        userIdResolver.resolve(authentication);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(RoomCategoryAssignmentResponse.from(
                        service.replaceRoomCategories(
                                roomId,
                                request.categoryIds(),
                                request.expectedVersion())));
    }
}
