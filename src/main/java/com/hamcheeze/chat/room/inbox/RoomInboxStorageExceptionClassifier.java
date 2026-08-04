package com.hamcheeze.chat.room.inbox;

import com.mongodb.MongoException;
import org.springframework.dao.DataAccessException;

import java.util.HashSet;
import java.util.Set;

final class RoomInboxStorageExceptionClassifier {

    boolean isStorageFailure(Throwable throwable) {
        Set<Throwable> visited = new HashSet<>();
        Throwable current = throwable;
        while (current != null && visited.add(current)) {
            if (current instanceof DataAccessException
                    || current instanceof MongoException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
