package com.hamcheeze.chat.room.label;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.userlabel.UserLabel;
import com.hamcheeze.chat.userlabel.UserLabelDirectory;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class RoomMemberUserLabelResolver {

    private final UserLabelDirectory directory;

    public RoomMemberUserLabelResolver(UserLabelDirectory directory) {
        this.directory = Objects.requireNonNull(directory, "directory");
    }

    public String resolve(Membership membership) {
        Objects.requireNonNull(membership, "membership");
        return resolveAll(List.of(membership)).get(membership.userId());
    }

    public Map<String, String> resolveAll(
            Collection<Membership> memberships
    ) {
        Objects.requireNonNull(memberships, "memberships");
        List<Membership> snapshot = List.copyOf(memberships);
        Map<String, String> storedLabels = directory.findByUserIds(
                snapshot.stream()
                        .map(Membership::userId)
                        .toList());
        Map<String, String> resolved = new LinkedHashMap<>();
        for (Membership membership : snapshot) {
            String userLabel = storedLabels.getOrDefault(
                    membership.userId(),
                    UserLabel.fallback(
                            membership.userId(),
                            membership.profile().displayName()));
            resolved.put(membership.userId(), userLabel);
        }
        return Map.copyOf(resolved);
    }
}
