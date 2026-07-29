package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.query.ChatMessageHistoryPage;
import com.hamcheeze.chat.message.query.ChatMessageHistoryService;
import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms/{roomId}/messages")
public class ChatMessageQueryController {

    private final ChatMessageHistoryService historyService;
    private final AuthenticatedUserIdResolver userIdResolver;

    public ChatMessageQueryController(
            ChatMessageHistoryService historyService,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.historyService = historyService;
        this.userIdResolver = userIdResolver;
    }

    @GetMapping
    public ResponseEntity<ChatMessageHistoryResponse> messages(
            Authentication authentication,
            @PathVariable String roomId,
            @RequestParam(required = false) Long beforeSequence,
            @RequestParam(required = false) Long afterSequence,
            @RequestParam(required = false) Integer limit
    ) {
        ChatMessageQueryValidation.cursors(
                beforeSequence,
                afterSequence);
        String userId = userIdResolver.resolve(authentication);
        String validatedRoomId =
                ChatMessageQueryValidation.roomId(roomId);
        int validatedLimit =
                ChatMessageQueryValidation.limit(limit);
        ChatMessageHistoryPage page;
        if (beforeSequence != null) {
            page = historyService.findBefore(
                    userId,
                    validatedRoomId,
                    ChatMessageQueryValidation.beforeSequence(
                            beforeSequence),
                    validatedLimit);
        } else if (afterSequence != null) {
            page = historyService.findAfter(
                    userId,
                    validatedRoomId,
                    ChatMessageQueryValidation.afterSequence(
                            afterSequence),
                    validatedLimit);
        } else {
            page = historyService.findLatest(
                    userId,
                    validatedRoomId,
                    validatedLimit);
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ChatMessageHistoryResponse.from(page));
    }
}
