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
            @RequestParam(required = false) Long afterSequence,
            @RequestParam(required = false) Integer limit
    ) {
        ChatMessageHistoryPage page = historyService.findAfter(
                userIdResolver.resolve(authentication),
                ChatMessageQueryValidation.roomId(roomId),
                ChatMessageQueryValidation.afterSequence(
                        afterSequence),
                ChatMessageQueryValidation.limit(limit));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ChatMessageHistoryResponse.from(page));
    }
}
