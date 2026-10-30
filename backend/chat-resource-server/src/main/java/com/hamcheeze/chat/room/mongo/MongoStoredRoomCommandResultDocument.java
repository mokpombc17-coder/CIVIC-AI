package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.persistence.StoredRoomCommandResult;
import org.springframework.data.annotation.PersistenceCreator;

import java.util.Objects;

public record MongoStoredRoomCommandResultDocument(
        String resultType,
        int resultSchemaVersion,
        String payload
) {

    @PersistenceCreator
    public MongoStoredRoomCommandResultDocument {
        Objects.requireNonNull(resultType, "resultType");
        Objects.requireNonNull(payload, "payload");
    }

    public static MongoStoredRoomCommandResultDocument fromDomain(
            StoredRoomCommandResult result
    ) {
        Objects.requireNonNull(result, "result");
        return new MongoStoredRoomCommandResultDocument(
                result.resultType(),
                result.resultSchemaVersion(),
                result.payload());
    }

    public StoredRoomCommandResult toDomain() {
        return new StoredRoomCommandResult(
                resultType,
                resultSchemaVersion,
                payload);
    }
}
