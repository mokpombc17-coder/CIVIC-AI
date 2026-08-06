// Run against an isolated local benchmark database:
// docker compose -f compose.local.yaml exec -T \
//   -e LISTED_ROOM_COUNT=1000 mongodb \
//   mongosh --quiet \
//   mongodb://localhost:27017/chat_query_benchmark --file /dev/stdin \
//   < scripts/listed-room-query-load.js

const roomCount = Number(process.env.LISTED_ROOM_COUNT || "1000");
const roomIdPrefix = "performance-listed-room-";
const batchSize = 500;

if (!Number.isSafeInteger(roomCount)
    || roomCount < 1
    || roomCount > 10000) {
    throw new Error("LISTED_ROOM_COUNT must be between 1 and 10000");
}

db.chat_rooms.deleteMany({
    _id: {$regex: `^${roomIdPrefix}`},
});
db.chat_rooms.createIndex(
    {status: 1, visibility: 1, _id: 1},
    {name: "ix_chat_room_status_visibility_cursor"});

const categories = ["POLICY", "ENVIRONMENT", "LOCAL_ISSUE"];
for (let offset = 0; offset < roomCount; offset += batchSize) {
    const operations = [];
    const end = Math.min(offset + batchSize, roomCount);
    for (let index = offset; index < end; index++) {
        const suffix = String(index).padStart(5, "0");
        let name = `일반 공개방 ${suffix}`;
        if (index % 20 === 0) {
            name = `지역 교통 정책 토론방 ${suffix}`;
        } else if (index % 5 === 0) {
            name = `법과 생활 토론방 ${suffix}`;
        }
        operations.push({
            insertOne: {
                document: {
                    _id: `${roomIdPrefix}${suffix}`,
                    schemaVersion: 4,
                    name,
                    description: `Listed Room query fixture ${suffix}`,
                    categories: [categories[index % categories.length]],
                    ownerUserId: `performance-owner-${suffix}`,
                    status: "ACTIVE",
                    visibility: "LISTED",
                    joinPolicy: index % 2 === 0
                        ? "OPEN"
                        : "INVITE_ONLY",
                    activeMemberCount: (index % 49) + 1,
                    createdAt: new Date(
                        Date.UTC(2026, 0, 1, 0, 0, index % 60)),
                    closedAt: null,
                    version: 0,
                },
            },
        });
    }
    db.chat_rooms.bulkWrite(operations, {ordered: false});
}

print(JSON.stringify({
    database: db.getName(),
    collection: "chat_rooms",
    roomCount,
    roomIdPrefix,
    indexName: "ix_chat_room_status_visibility_cursor",
}, null, 2));
