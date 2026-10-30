package com.hamcheeze.vote.persona.application.port.out;

import com.hamcheeze.vote.persona.application.integration.PersonaInboxReceipt;

import java.util.UUID;

public interface PersonaInboxRepository {

    boolean recordIfAbsent(PersonaInboxReceipt receipt);

    boolean exists(String consumerName, UUID eventId);
}
