package com.hamcheeze.chat.room.category;

import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryUsage;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

public final class RoomCategoryService {

    private final RoomCategoryStore store;
    private final RoomCategoryUsage usage;
    private final TransactionOperations transactions;
    private final Clock clock;
    private final Supplier<String> categoryIdGenerator;

    public RoomCategoryService(
            RoomCategoryStore store,
            RoomCategoryUsage usage,
            TransactionOperations transactions,
            Clock clock,
            Supplier<String> categoryIdGenerator
    ) {
        this.store = Objects.requireNonNull(store, "store");
        this.usage = Objects.requireNonNull(usage, "usage");
        this.transactions = Objects.requireNonNull(
                transactions,
                "transactions");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.categoryIdGenerator = Objects.requireNonNull(
                categoryIdGenerator,
                "categoryIdGenerator");
    }

    public List<RoomCategory> findAll() {
        return store.findAll();
    }

    public RoomCategory findById(String categoryId) {
        return store.findById(categoryId)
                .orElseThrow(RoomCategoryService::notFound);
    }

    public RoomCategory create(String name) {
        RoomCategory category;
        try {
            category = RoomCategory.create(
                    categoryIdGenerator.get(),
                    name,
                    clock.instant());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw invalidCategory(exception);
        }
        try {
            store.insert(category);
            return category;
        } catch (DuplicateKeyException exception) {
            throw nameConflict(exception);
        }
    }

    public RoomCategory rename(
            String categoryId,
            String name,
            long expectedVersion
    ) {
        RoomCategory current = findById(categoryId);
        requireExpectedVersion(current, expectedVersion);
        RoomCategory renamed;
        try {
            renamed = current.rename(name, clock.instant());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw invalidCategory(exception);
        }
        if (renamed == current) {
            return current;
        }
        try {
            if (!store.replaceIfVersionMatches(
                    renamed,
                    expectedVersion)) {
                throw versionConflict();
            }
            return renamed;
        } catch (DuplicateKeyException exception) {
            throw nameConflict(exception);
        }
    }

    public void delete(
            String categoryId,
            long expectedVersion
    ) {
        transactions.executeWithoutResult(status -> {
            RoomCategory current = findById(categoryId);
            requireExpectedVersion(current, expectedVersion);
            if (RoomCategoryDefaults.POLICY_CATEGORY_ID.equals(
                    current.categoryId())) {
                throw new RoomCategoryException(
                        RoomCategoryErrorCode
                                .ROOM_CATEGORY_DEFAULT_PROTECTED,
                        "The default Room category cannot be deleted");
            }
            long referencedRoomCount = usage.countRoomsUsing(
                    current.categoryId());
            if (referencedRoomCount > 0) {
                throw new RoomCategoryException(
                        RoomCategoryErrorCode.ROOM_CATEGORY_IN_USE,
                        "The Room category is assigned to one or more Rooms",
                        referencedRoomCount);
            }
            if (!store.deleteIfVersionMatches(
                    current.categoryId(),
                    expectedVersion)) {
                throw versionConflict();
            }
        });
    }

    private static void requireExpectedVersion(
            RoomCategory category,
            long expectedVersion
    ) {
        if (expectedVersion < 0
                || category.version() != expectedVersion) {
            throw versionConflict();
        }
    }

    private static RoomCategoryException invalidCategory(
            RuntimeException cause
    ) {
        return new RoomCategoryException(
                RoomCategoryErrorCode.INVALID_ROOM_CATEGORY,
                "The Room category is invalid",
                cause);
    }

    private static RoomCategoryException notFound() {
        return new RoomCategoryException(
                RoomCategoryErrorCode.ROOM_CATEGORY_NOT_FOUND,
                "The Room category was not found");
    }

    private static RoomCategoryException nameConflict(
            DuplicateKeyException cause
    ) {
        return new RoomCategoryException(
                RoomCategoryErrorCode.ROOM_CATEGORY_NAME_CONFLICT,
                "A Room category with the same name already exists",
                cause);
    }

    private static RoomCategoryException versionConflict() {
        return new RoomCategoryException(
                RoomCategoryErrorCode.ROOM_CATEGORY_VERSION_CONFLICT,
                "The Room category was changed by another request");
    }
}
