// Run after unread-query-load.js with matching UNREAD_ROOM_ID/COUNT:
// docker compose -f compose.local.yaml exec -T \
//   -e UNREAD_ROOM_COUNT=20 mongodb \
//   mongosh --quiet mongodb://localhost:27017/chat_local --file /dev/stdin \
//   < scripts/unread-query-benchmark.js

const roomIdPrefix = process.env.UNREAD_ROOM_ID || "performance-room";
const roomCount = Number(process.env.UNREAD_ROOM_COUNT || "20");
const currentUserId = process.env.UNREAD_USER_ID || "performance-user";
const readThroughSequence = Number(
    process.env.UNREAD_THROUGH_SEQUENCE || "0");
const cap = Number(process.env.UNREAD_COUNT_CAP || "200");
const rounds = Number(process.env.UNREAD_BENCHMARK_ROUNDS || "30");

if (!Number.isSafeInteger(roomCount) || roomCount < 1 || roomCount > 20
    || !Number.isSafeInteger(readThroughSequence)
    || readThroughSequence < 0
    || !Number.isSafeInteger(cap) || cap < 1
    || !Number.isSafeInteger(rounds) || rounds < 1 || rounds > 1000) {
    throw new Error("Unread benchmark parameters are invalid");
}

const roomIds = roomCount === 1
    ? [roomIdPrefix]
    : Array.from(
        {length: roomCount},
        (_, index) => `${roomIdPrefix}-${index + 1}`);
const countDurationsMs = [];
const pageDurationsMs = [];
let commands = 0;
let maximumObserved = 0;

for (let round = 0; round < rounds; round++) {
    const pageStarted = Date.now();
    for (const roomId of roomIds) {
        const started = Date.now();
        const result = db.runCommand({
            count: "chat_messages",
            query: {
                roomId,
                roomSequence: {$gt: readThroughSequence},
                state: "ACTIVE",
                countable: true,
                senderUserId: {$ne: currentUserId},
            },
            limit: cap + 1,
            maxTimeMS: 1000,
            hint: "ix_chat_message_unread",
        });
        if (!result.ok) throw new Error(JSON.stringify(result));
        countDurationsMs.push(Date.now() - started);
        maximumObserved = Math.max(maximumObserved, Number(result.n));
        commands++;
    }
    pageDurationsMs.push(Date.now() - pageStarted);
}

function percentile(values, value) {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(
        0,
        Math.ceil((value / 100) * sorted.length) - 1);
    return sorted[index];
}

function summary(values) {
    return {
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
        max: Math.max(...values),
    };
}

print(JSON.stringify({
    environment: "local mongosh; sequential DB commands; not HTTP latency",
    roomCount,
    rounds,
    commands,
    observedLimit: cap + 1,
    maximumObserved,
    perCountMilliseconds: summary(countDurationsMs),
    perPageMilliseconds: summary(pageDurationsMs),
}, null, 2));
