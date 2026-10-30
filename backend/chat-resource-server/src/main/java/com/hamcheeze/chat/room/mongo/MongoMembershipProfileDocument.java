package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.MembershipProfile;

import java.time.Instant;
import java.util.Objects;

public record MongoMembershipProfileDocument(
        long participantNumber,
        String displayName,
        String imageUrl,
        long version,
        Instant createdAt,
        Instant updatedAt
) {

    public MongoMembershipProfileDocument {
        Objects.requireNonNull(displayName, "displayName");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    static MongoMembershipProfileDocument fromDomain(
            MembershipProfile profile
    ) {
        Objects.requireNonNull(profile, "profile");
        return new MongoMembershipProfileDocument(
                profile.participantNumber(),
                profile.displayName(),
                profile.imageUrl(),
                profile.version(),
                profile.createdAt(),
                profile.updatedAt());
    }

    MembershipProfile toDomain() {
        return MembershipProfile.restore(
                participantNumber,
                displayName,
                imageUrl,
                version,
                createdAt,
                updatedAt);
    }
}
