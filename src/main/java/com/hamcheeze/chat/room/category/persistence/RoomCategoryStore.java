package com.hamcheeze.chat.room.category.persistence;

import com.hamcheeze.chat.room.category.RoomCategory;

import java.util.List;
import java.util.Optional;

public interface RoomCategoryStore {

    Optional<RoomCategory> findById(String categoryId);

    List<RoomCategory> findAll();

    void insert(RoomCategory category);

    boolean insertIfAbsent(RoomCategory category);

    boolean replaceIfVersionMatches(
            RoomCategory category,
            long expectedVersion);

    boolean deleteIfVersionMatches(
            String categoryId,
            long expectedVersion);
}
