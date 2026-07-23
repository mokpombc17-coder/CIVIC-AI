package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.ArrayList;
import java.util.List;

@Validated
@ConfigurationProperties("chat.websocket.message")
public class ChatContentProperties {

    @NotBlank
    private String clientMessageIdRegex = "^[A-Za-z0-9._:-]{1,128}$";
    @NotBlank
    private String roomIdRegex = "^[A-Za-z0-9_-]{1,64}$";
    @Min(1)
    private int maxContentCodePoints = 2_000;
    @Min(1)
    private int maxContentUtf8Bytes = 8_192;
    @Min(1)
    private int maxStompMessageBytes = 32 * 1_024;
    @AssertTrue
    private boolean normalizeContentWithStrip = true;
    @NotEmpty
    private List<String> rejectC0ControlCharactersExcept =
            new ArrayList<>(List.of("TAB", "LF", "CR"));

    public String getClientMessageIdRegex() {
        return clientMessageIdRegex;
    }

    public void setClientMessageIdRegex(String value) {
        this.clientMessageIdRegex = value;
    }

    public String getRoomIdRegex() {
        return roomIdRegex;
    }

    public void setRoomIdRegex(String value) {
        this.roomIdRegex = value;
    }

    public int getMaxContentCodePoints() {
        return maxContentCodePoints;
    }

    public void setMaxContentCodePoints(int value) {
        this.maxContentCodePoints = value;
    }

    public int getMaxContentUtf8Bytes() {
        return maxContentUtf8Bytes;
    }

    public void setMaxContentUtf8Bytes(int value) {
        this.maxContentUtf8Bytes = value;
    }

    public int getMaxStompMessageBytes() {
        return maxStompMessageBytes;
    }

    public void setMaxStompMessageBytes(int value) {
        this.maxStompMessageBytes = value;
    }

    public boolean isNormalizeContentWithStrip() {
        return normalizeContentWithStrip;
    }

    public void setNormalizeContentWithStrip(boolean value) {
        this.normalizeContentWithStrip = value;
    }

    public List<String> getRejectC0ControlCharactersExcept() {
        return rejectC0ControlCharactersExcept;
    }

    public void setRejectC0ControlCharactersExcept(List<String> value) {
        this.rejectC0ControlCharactersExcept = new ArrayList<>(value);
    }
}
