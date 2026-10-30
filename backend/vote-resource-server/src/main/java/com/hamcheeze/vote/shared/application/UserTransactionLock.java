package com.hamcheeze.vote.shared.application;

public interface UserTransactionLock {

    void lock(String userId);
}
