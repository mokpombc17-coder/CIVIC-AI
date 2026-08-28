package com.hamcheeze.chat.room.category.persistence;

public interface RoomCategoryUsage {

    long countRoomsUsing(String categoryId);
}
