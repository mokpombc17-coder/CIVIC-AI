package com.hamcheeze.vote.opinionmap.application.port.out;

import com.hamcheeze.vote.opinionmap.application.integration.OpinionMapInboxReceipt;

import java.util.Optional;
import java.util.UUID;

public interface OpinionMapInboxRepository {

    boolean recordIfAbsent(OpinionMapInboxReceipt receipt);

    Optional<OpinionMapInboxReceipt> find(String consumerName, UUID eventId);
}
