package com.hamcheeze.chat.export;

import java.util.List;

public record ChatExportSnapshot(
        ChatExportRoomSnapshot room,
        List<ChatExportParticipantSnapshot> participants
) {
}
