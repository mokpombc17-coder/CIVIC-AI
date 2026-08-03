// Run with:
// docker compose -f compose.local.yaml exec -T mongodb \
//   mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
//   < scripts/unread-query-explain.js

const targetRoomId = process.env.UNREAD_ROOM_ID || "performance-room";
const currentUserId = process.env.UNREAD_USER_ID || "performance-user";
const readThroughSequence = Number(
    process.env.UNREAD_THROUGH_SEQUENCE || "0");
const cap = Number(process.env.UNREAD_COUNT_CAP || "200");

if (!Number.isSafeInteger(readThroughSequence)
    || readThroughSequence < 0
    || !Number.isSafeInteger(cap)
    || cap < 1) {
    throw new Error("Unread explain parameters are invalid");
}

const query = {
    roomId: targetRoomId,
    roomSequence: {$gt: readThroughSequence},
    state: "ACTIVE",
    countable: true,
    senderUserId: {$ne: currentUserId},
};
const explanation = db.runCommand({
    explain: {
        count: "chat_messages",
        query,
        limit: cap + 1,
        hint: "ix_chat_message_unread",
    },
    verbosity: "executionStats",
});

if (!explanation.ok) {
    throw new Error(JSON.stringify(explanation));
}

function findIndexName(stage) {
    if (!stage || typeof stage !== "object") return null;
    if (stage.indexName) return stage.indexName;
    for (const value of Object.values(stage)) {
        const found = findIndexName(value);
        if (found) return found;
    }
    return null;
}

function findNumber(stage, key) {
    if (!stage || typeof stage !== "object") return null;
    if (typeof stage[key] === "number") return stage[key];
    for (const value of Object.values(stage)) {
        const found = findNumber(value, key);
        if (found !== null) return found;
    }
    return null;
}

print(JSON.stringify({
    roomId: targetRoomId,
    readThroughSequence,
    cap,
    observedLimit: cap + 1,
    indexName: findIndexName(explanation.queryPlanner.winningPlan),
    winningPlan: explanation.queryPlanner.winningPlan,
    totalKeysExamined: explanation.executionStats.totalKeysExamined,
    totalDocsExamined: explanation.executionStats.totalDocsExamined,
    executionTimeMillis: explanation.executionStats.executionTimeMillis,
    nReturned: explanation.executionStats.nReturned,
    counted: findNumber(
        explanation.executionStats.executionStages,
        "nCounted") ?? findNumber(
        explanation.executionStats.executionStages,
        "nCount"),
}, null, 2));
