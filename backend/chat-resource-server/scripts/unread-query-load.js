// Example:
// docker compose -f compose.local.yaml exec -T \
//   -e UNREAD_MESSAGE_COUNT=50000 mongodb \
//   mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
//   < scripts/unread-query-load.js

const targetRoomId = process.env.UNREAD_ROOM_ID || "performance-room";
const currentUserId = process.env.UNREAD_USER_ID || "performance-user";
const messageCount = Number(process.env.UNREAD_MESSAGE_COUNT || "1000");
const roomCount = Number(process.env.UNREAD_ROOM_COUNT || "1");
const messageSchemaVersion = 5;

if (!Number.isSafeInteger(messageCount)
    || messageCount < 1
    || messageCount > 100000
    || !Number.isSafeInteger(roomCount)
    || roomCount < 1
    || roomCount > 20) {
    throw new Error(
        "UNREAD_MESSAGE_COUNT must be 1..100000 and "
        + "UNREAD_ROOM_COUNT must be 1..20");
}

const roomIds = roomCount === 1
    ? [targetRoomId]
    : Array.from(
        {length: roomCount},
        (_, index) => `${targetRoomId}-${index + 1}`);
db.chat_messages.deleteMany({roomId: {$in: roomIds}});
const createdAt = new Date();
let inserted = 0;
for (const roomId of roomIds) {
    const selfMembershipId = `${roomId}-self-membership`;
    const otherMembershipId = `${roomId}-other-membership`;
    for (let start = 1; start <= messageCount; start += 1000) {
        const documents = [];
        const end = Math.min(start + 999, messageCount);
        for (let sequence = start; sequence <= end; sequence++) {
            const deleted = sequence % 10 === 0;
            const countable = sequence % 20 !== 0;
            documents.push({
                _id: `${roomId}-message-${sequence}`,
                schemaVersion: messageSchemaVersion,
                roomId,
                roomSequence: NumberLong(sequence.toString()),
                senderUserId: sequence % 2 === 0
                    ? currentUserId
                    : "performance-other-user",
                senderMembershipId: sequence % 2 === 0
                    ? selfMembershipId
                    : otherMembershipId,
                clientMessageId: `${roomId}-client-${sequence}`,
                content: deleted ? null
                    : `performance message ${sequence}`,
                retainedContent: deleted
                    ? `performance message ${sequence}`
                    : null,
                creationContentFingerprint: "0".repeat(64),
                state: deleted ? "DELETED_BY_AUTHOR" : "ACTIVE",
                countable,
                messageVersion: NumberLong(
                    (deleted ? 2 : 1).toString()),
                createdAt,
                updatedAt: createdAt,
                deletedAt: deleted ? createdAt : null,
            });
        }
        db.chat_messages.insertMany(documents, {ordered: false});
        inserted += documents.length;
    }
}

print(JSON.stringify({
    roomIds,
    roomCount,
    messagesPerRoom: messageCount,
    inserted,
    selfSenderRatio: "50%",
    deletedEvery: 10,
    countableFalseEvery: 20,
}, null, 2));
