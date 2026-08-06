package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.api.dto.UpdateRoomSettingsRequest;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UpdateRoomSettingsRequestTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void preservesFieldPresenceAndEmptyDescription() throws Exception {
        UpdateRoomSettingsRequest request =
                UpdateRoomSettingsRequest.from(mapper.readTree("""
                        {
                          "description":"",
                          "categories":["ENVIRONMENT"],
                          "visibility":"UNLISTED",
                          "joinPolicy":"INVITE_ONLY"
                        }
                        """));

        assertThat(request.namePresent()).isFalse();
        assertThat(request.descriptionPresent()).isTrue();
        assertThat(request.description()).isEmpty();
        assertThat(request.categoriesPresent()).isTrue();
        assertThat(request.categories())
                .containsExactly(RoomCategory.ENVIRONMENT);
        assertThat(request.visibility())
                .isEqualTo(RoomVisibility.UNLISTED);
        assertThat(request.joinPolicy())
                .isEqualTo(JoinPolicy.INVITE_ONLY);
    }

    @Test
    void rejectsEmptyUnknownAndExplicitNullFields() throws Exception {
        for (String body : new String[]{
                "{}",
                "{\"unknown\":\"value\"}",
                "{\"name\":null}",
                "{\"description\":null}",
                "{\"categories\":null}",
                "{\"categories\":[]}",
                "{\"categories\":[\"POLICY\",\"ENVIRONMENT\"]}",
                "{\"categories\":[\"UNKNOWN\"]}",
                "{\"visibility\":null}",
                "{\"joinPolicy\":null}"}) {
            assertThatThrownBy(() ->
                    UpdateRoomSettingsRequest.from(
                            mapper.readTree(body)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
