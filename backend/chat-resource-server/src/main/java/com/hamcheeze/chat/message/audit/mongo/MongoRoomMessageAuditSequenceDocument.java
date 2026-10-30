package com.hamcheeze.chat.message.audit.mongo;

import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

@Document(collection = MongoRoomMessageAuditSequenceDocument.COLLECTION_NAME)
public record MongoRoomMessageAuditSequenceDocument(
        @MongoId(FieldType.STRING)
        String roomId,
        long lastSequence
) {

    public static final String COLLECTION_NAME =
            "chat_room_message_audit_sequences";
}
