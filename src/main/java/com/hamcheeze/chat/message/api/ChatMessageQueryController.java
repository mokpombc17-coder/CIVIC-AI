package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.query.ChatMessageHistoryPage;
import com.hamcheeze.chat.message.query.ChatMessageHistoryService;
import com.hamcheeze.chat.message.context.ChatMessageContext;
import com.hamcheeze.chat.message.context.ChatMessageContextService;
import com.hamcheeze.chat.message.search.ChatMessageSearchCriteria;
import com.hamcheeze.chat.message.search.ChatMessageSearchNormalizer;
import com.hamcheeze.chat.message.search.ChatMessageSearchPage;
import com.hamcheeze.chat.message.search.ChatMessageSearchProperties;
import com.hamcheeze.chat.message.search.ChatMessageSearchService;
import com.hamcheeze.chat.room.api.AuthenticatedUserIdResolver;
import com.hamcheeze.chat.room.api.RoomApiErrorCode;
import com.hamcheeze.chat.room.api.RoomApiInputException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/rooms/{roomId}/messages")
public class ChatMessageQueryController {

    private final ChatMessageHistoryService historyService;
    private final ChatMessageContextService contextService;
    private final ChatMessageSearchService searchService;
    private final ChatMessageSearchNormalizer searchNormalizer;
    private final ChatMessageSearchProperties searchProperties;
    private final AuthenticatedUserIdResolver userIdResolver;

    public ChatMessageQueryController(
            ChatMessageHistoryService historyService,
            ChatMessageContextService contextService,
            ChatMessageSearchService searchService,
            ChatMessageSearchNormalizer searchNormalizer,
            ChatMessageSearchProperties searchProperties,
            AuthenticatedUserIdResolver userIdResolver
    ) {
        this.historyService = historyService;
        this.contextService = contextService;
        this.searchService = searchService;
        this.searchNormalizer = searchNormalizer;
        this.searchProperties = searchProperties;
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

    @PostMapping("/search")
    public ResponseEntity<ChatMessageSearchResponse> search(
            Authentication authentication,
            @PathVariable String roomId,
            @RequestBody(required = false)
            ChatMessageSearchRequest request
    ) {
        if (request == null) {
            throw invalidSearchRequest("Request body is required");
        }
        ChatMessageSearchCriteria criteria;
        try {
            criteria = ChatMessageSearchCriteria.resolve(
                    request.query(),
                    request.limit(),
                    searchNormalizer,
                    searchProperties);
        } catch (IllegalArgumentException exception) {
            throw invalidSearchRequest(exception.getMessage());
        }
        String userId = userIdResolver.resolve(authentication);
        String validatedRoomId = ChatMessageQueryValidation.roomId(
                roomId);
        ChatMessageSearchPage page = searchService.search(
                userId,
                validatedRoomId,
                criteria,
                request.cursor());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ChatMessageSearchResponse.from(page));
    }

    @GetMapping("/{messageId}/context")
    public ResponseEntity<ChatMessageContextResponse> context(
            Authentication authentication,
            @PathVariable String roomId,
            @PathVariable String messageId,
            @RequestParam(required = false) Integer before,
            @RequestParam(required = false) Integer after
    ) {
        String userId = userIdResolver.resolve(authentication);
        String validatedRoomId = ChatMessageQueryValidation.roomId(
                roomId);
        String validatedMessageId = ChatMessageQueryValidation.messageId(
                messageId);
        int validatedBefore = ChatMessageQueryValidation.contextWindow(
                before,
                "before");
        int validatedAfter = ChatMessageQueryValidation.contextWindow(
                after,
                "after");
        ChatMessageContext context = contextService.find(
                userId,
                validatedRoomId,
                validatedMessageId,
                validatedBefore,
                validatedAfter);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ChatMessageContextResponse.from(context));
    }

    private RoomApiInputException invalidSearchRequest(
            String detail
    ) {
        return new RoomApiInputException(
                RoomApiErrorCode.INVALID_REQUEST,
                HttpStatus.BAD_REQUEST,
                detail == null || detail.isBlank()
                        ? "Invalid message search request"
                        : detail);
    }
}
