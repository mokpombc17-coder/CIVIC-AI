package com.hamcheeze.chat.userlabel;

import java.util.Collection;
import java.util.Map;

public interface UserLabelDirectory {

    void upsert(String userId, String userLabel);

    Map<String, String> findByUserIds(Collection<String> userIds);

    static UserLabelDirectory noop() {
        return NoOpUserLabelDirectory.INSTANCE;
    }

    final class NoOpUserLabelDirectory implements UserLabelDirectory {
        private static final NoOpUserLabelDirectory INSTANCE =
                new NoOpUserLabelDirectory();

        private NoOpUserLabelDirectory() {
        }

        @Override
        public void upsert(String userId, String userLabel) {
        }

        @Override
        public Map<String, String> findByUserIds(
                Collection<String> userIds
        ) {
            return Map.of();
        }
    }
}
