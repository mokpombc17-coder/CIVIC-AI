package com.hamcheeze.chat.room.category.api;

import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import com.hamcheeze.chat.room.category.RoomCategory;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.category.api.dto.CreateRoomCategoryRequest;
import com.hamcheeze.chat.room.category.api.dto.RenameRoomCategoryRequest;
import com.hamcheeze.chat.room.category.api.dto.RoomCategoryListResponse;
import com.hamcheeze.chat.room.category.api.dto.RoomCategoryResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/admin/room-categories")
public class AdminRoomCategoryController {

    private final RoomCategoryService service;
    private final AuthenticatedUserIdResolver userIdResolver;

    public AdminRoomCategoryController(
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
        requireAdmin(authentication);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new RoomCategoryListResponse(
                        service.findAll().stream()
                                .map(RoomCategoryResponse::from)
                                .toList()));
    }

    @GetMapping("/{categoryId}")
    public ResponseEntity<RoomCategoryResponse> category(
            Authentication authentication,
            @PathVariable String categoryId
    ) {
        requireAdmin(authentication);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(RoomCategoryResponse.from(
                        service.findById(categoryId)));
    }

    @PostMapping
    public ResponseEntity<RoomCategoryResponse> create(
            Authentication authentication,
            @Valid @RequestBody CreateRoomCategoryRequest request
    ) {
        requireAdmin(authentication);
        RoomCategory created = service.create(request.name());
        URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{categoryId}")
                .buildAndExpand(created.categoryId())
                .toUri();
        return ResponseEntity.created(location)
                .cacheControl(CacheControl.noStore())
                .body(RoomCategoryResponse.from(created));
    }

    @PatchMapping("/{categoryId}")
    public ResponseEntity<RoomCategoryResponse> rename(
            Authentication authentication,
            @PathVariable String categoryId,
            @Valid @RequestBody RenameRoomCategoryRequest request
    ) {
        requireAdmin(authentication);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(RoomCategoryResponse.from(service.rename(
                        categoryId,
                        request.name(),
                        request.expectedVersion())));
    }

    @DeleteMapping("/{categoryId}")
    public ResponseEntity<Void> delete(
            Authentication authentication,
            @PathVariable String categoryId,
            @RequestParam
            @PositiveOrZero long expectedVersion
    ) {
        requireAdmin(authentication);
        service.delete(categoryId, expectedVersion);
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .build();
    }

    private void requireAdmin(Authentication authentication) {
        userIdResolver.resolve(authentication);
    }
}
