// Run against an isolated local benchmark database:
// docker compose -f compose.local.yaml exec -T \
//   -e MESSAGE_SEARCH_MESSAGE_COUNT=10000 mongodb \
//   mongosh --quiet \
//   mongodb://localhost:27017/chat_message_search_benchmark --file /dev/stdin \
//   < scripts/message-search-load.js

const roomId = process.env.MESSAGE_SEARCH_ROOM_ID
    || "performance-message-search-room";
const messageCount = Number(
    process.env.MESSAGE_SEARCH_MESSAGE_COUNT || "10000");
const matchEvery = Number(
    process.env.MESSAGE_SEARCH_MATCH_EVERY || "100");
const contentLength = Number(
    process.env.MESSAGE_SEARCH_CONTENT_LENGTH || "2000");
const messageSchemaVersion = 5;

if (!Number.isSafeInteger(messageCount)
    || messageCount < 1
    || messageCount > 100000
    || !Number.isSafeInteger(matchEvery)
    || matchEvery < 1
    || matchEvery > messageCount
    || !Number.isSafeInteger(contentLength)
    || contentLength < 32
    || contentLength > 4000) {
    throw new Error(
        "MESSAGE_SEARCH_MESSAGE_COUNT must be 1..100000, "
        + "MESSAGE_SEARCH_MATCH_EVERY must be within the fixture, and "
        + "MESSAGE_SEARCH_CONTENT_LENGTH must be 32..4000");
}

db.chat_messages.deleteMany({roomId});
db.chat_messages.createIndex(
    {roomId: 1, roomSequence: 1},
    {name: "uk_chat_message_room_sequence", unique: true});
db.chat_messages.createIndex(
    {roomId: 1, roomSequence: 1, senderUserId: 1},
    {
        name: "ix_chat_message_unread",
        partialFilterExpression: {state: "ACTIVE", countable: true},
    });

const createdAt = new Date();
const filler = "x".repeat(contentLength - 31);
let activeCountable = 0;
let matches = 0;
let deleted = 0;
let nonCountable = 0;

for (let start = 1; start <= messageCount; start += 1000) {
    const documents = [];
    const end = Math.min(start + 999, messageCount);
    for (let sequence = start; sequence <= end; sequence++) {
        const isDeleted = sequence % 10 === 0;
        const isCountable = sequence % 17 !== 0;
        const isMatch = !isDeleted
            && isCountable
            && sequence % matchEvery === 1;
        if (isDeleted) deleted++;
        if (!isCountable) nonCountable++;
        if (!isDeleted && isCountable) activeCountable++;
        if (isMatch) matches++;

        const senderUserId = sequence % 2 === 0
            ? "performance-search-self"
            : "performance-search-other";
        const senderMembershipId = sequence % 2 === 0
            ? `${roomId}-self-membership`
            : `${roomId}-other-membership`;
        documents.push({
            _id: `${roomId}-message-${sequence}`,
            schemaVersion: messageSchemaVersion,
            roomId,
            roomSequence: NumberLong(sequence.toString()),
            senderUserId,
            senderMembershipId,
            clientMessageId: `${roomId}-client-${sequence}`,
            content: isDeleted
                ? null
                : `${isMatch ? "search-needle" : "ordinary-text"} ${filler}`,
            retainedContent: isDeleted
                ? `ordinary-text ${filler}`
                : null,
            creationContentFingerprint: "0".repeat(64),
            state: isDeleted ? "DELETED_BY_AUTHOR" : "ACTIVE",
            countable: isCountable,
            messageVersion: NumberLong(
                (isDeleted ? 2 : 1).toString()),
            createdAt,
            updatedAt: createdAt,
            deletedAt: isDeleted ? createdAt : null,
        });
    }
    db.chat_messages.insertMany(documents, {ordered: false});
}

print(JSON.stringify({
    database: db.getName(),
    collection: "chat_messages",
    roomId,
    messageCount,
    activeCountable,
    matches,
    matchEvery,
    contentLength,
    deleted,
    nonCountable,
    messageSchemaVersion,
}, null, 2));
