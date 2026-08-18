package com.hamcheeze.vote.shared.infra;

import com.hamcheeze.vote.shared.application.UserTransactionLock;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PostgresUserTransactionLock implements UserTransactionLock {

    private static final long LOCK_NAMESPACE_SEED = 0x4E44505FL;

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lock(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("userId must not be blank");
        }
        entityManager.createNativeQuery(
                        "SELECT pg_advisory_xact_lock("
                                + "hashtextextended(:userId, :seed))")
                .setParameter("userId", userId.strip())
                .setParameter("seed", LOCK_NAMESPACE_SEED)
                .getSingleResult();
    }
}
