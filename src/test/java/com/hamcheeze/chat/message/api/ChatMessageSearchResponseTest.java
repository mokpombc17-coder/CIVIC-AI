package com.hamcheeze.chat.message.api;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageSearchResponseTest {

    @Test
    void permitsCompletedAndIncompleteResponseShapes() {
        assertThat(new ChatMessageSearchResponse(
                new ArrayList<>(), null, true).searchComplete())
                .isTrue();
        assertThat(new ChatMessageSearchResponse(
                new ArrayList<>(), "cursor", false).searchComplete())
                .isFalse();
    }

    @Test
    void rejectsCursorCompletionInvariantViolations() {
        assertThatThrownBy(() -> new ChatMessageSearchResponse(
                new ArrayList<>(), "cursor", true))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ChatMessageSearchResponse(
                new ArrayList<>(), null, false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void defensivelyCopiesItems() {
        var items = new ArrayList<
                com.hamcheeze.chat.delivery.ChatMessagePayload>();
        ChatMessageSearchResponse response =
                new ChatMessageSearchResponse(items, null, true);

        items.clear();

        assertThat(response.items()).isEmpty();
        assertThatThrownBy(() -> response.items().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
