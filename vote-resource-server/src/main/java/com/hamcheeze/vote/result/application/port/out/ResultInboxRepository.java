package com.hamcheeze.vote.result.application.port.out;

import com.hamcheeze.vote.result.application.integration.ResultInboxReceipt;

import java.util.Optional;
import java.util.UUID;

public interface ResultInboxRepository {

    boolean recordIfAbsent(ResultInboxReceipt receipt);

    Optional<ResultInboxReceipt> find(String consumerName, UUID eventId);
}
