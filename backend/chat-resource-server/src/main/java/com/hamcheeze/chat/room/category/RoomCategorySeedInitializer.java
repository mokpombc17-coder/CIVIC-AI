package com.hamcheeze.chat.room.category;

import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;

import java.time.Clock;
import java.util.Objects;

public final class RoomCategorySeedInitializer {

    private final RoomCategoryStore store;
    private final Clock clock;

    public RoomCategorySeedInitializer(
            RoomCategoryStore store,
            Clock clock
    ) {
        this.store = Objects.requireNonNull(store, "store");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public void initialize() {
        store.insertIfAbsent(RoomCategory.create(
                RoomCategoryDefaults.POLICY_CATEGORY_ID,
                RoomCategoryDefaults.POLICY_CATEGORY_NAME,
                clock.instant()));
    }
}
