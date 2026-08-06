package com.hamcheeze.chat.room.mongo;

public final class MongoUserActiveRoomQuotaLockDocument {

    public static final String COLLECTION_NAME =
            "chat_user_active_room_quota_locks";
    public static final int SCHEMA_VERSION = 1;

    private MongoUserActiveRoomQuotaLockDocument() {
    }
}
