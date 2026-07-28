package com.hamcheeze.chat.room.persistence;

import java.util.Optional;

public interface RoomCommandReceiptStore {

    Optional<RoomCommandReceipt> findByRequest(
            String requesterUserId,
            String clientRequestId
    );

    void insert(RoomCommandReceipt receipt);
}
