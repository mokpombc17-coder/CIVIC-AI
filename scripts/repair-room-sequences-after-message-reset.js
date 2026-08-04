// Usage:
//   REPAIR_ROOM_SEQUENCE_MODE=dry-run mongosh ... --file this-file
//   REPAIR_ROOM_SEQUENCE_MODE=apply   mongosh ... --file this-file
//
// This restores a safe lower bound. It cannot reconstruct an exact sequence
// value that was lost when chat_room_sequences was deleted.

const mode = process.env.REPAIR_ROOM_SEQUENCE_MODE || "dry-run";
if (mode !== "dry-run" && mode !== "apply") {
    throw new Error(
        "REPAIR_ROOM_SEQUENCE_MODE must be dry-run or apply");
}

const zero = NumberLong("0");
const rows = db.chat_rooms.aggregate([
    {$project: {_id: 0, roomId: "$_id"}},
    {$unionWith: {
        coll: "chat_room_sequences",
        pipeline: [{$project: {
            _id: 0,
            roomId: "$_id",
            existingLastSequence: "$lastSequence",
            boundaryRevision: "$boundaryRevision",
        }}],
    }},
    {$unionWith: {
        coll: "chat_memberships",
        pipeline: [{$project: {
            _id: 0,
            roomId: 1,
            maxMembershipBoundary: "$messageVisibleAfterSequence",
        }}],
    }},
    {$unionWith: {
        coll: "chat_messages",
        pipeline: [{$project: {
            _id: 0,
            roomId: 1,
            maxMessageSequence: "$roomSequence",
        }}],
    }},
    {$unionWith: {
        coll: "chat_room_read_states",
        pipeline: [{$project: {
            _id: 0,
            roomId: 1,
            maxReadStateSequence: "$lastReadSequence",
        }}],
    }},
    {$match: {roomId: {$type: "string", $ne: ""}}},
    {$group: {
        _id: "$roomId",
        existingLastSequence: {$max: "$existingLastSequence"},
        boundaryRevision: {$max: "$boundaryRevision"},
        maxMembershipBoundary: {$max: "$maxMembershipBoundary"},
        maxMessageSequence: {$max: "$maxMessageSequence"},
        maxReadStateSequence: {$max: "$maxReadStateSequence"},
    }},
    {$set: {
        existingLastSequence: {$ifNull: ["$existingLastSequence", zero]},
        boundaryRevision: {$ifNull: ["$boundaryRevision", zero]},
        maxMembershipBoundary: {$ifNull: ["$maxMembershipBoundary", zero]},
        maxMessageSequence: {$ifNull: ["$maxMessageSequence", zero]},
        maxReadStateSequence: {$ifNull: ["$maxReadStateSequence", zero]},
    }},
    {$set: {
        requiredLastSequence: {$max: [
            "$existingLastSequence",
            "$maxMembershipBoundary",
            "$maxMessageSequence",
            "$maxReadStateSequence",
        ]},
    }},
    {$sort: {_id: 1}},
]).toArray();

let created = 0;
let increased = 0;
let unchanged = 0;
for (const row of rows) {
    const exists = db.chat_room_sequences.countDocuments(
        {_id: row._id}, {limit: 1}) === 1;
    const action = !exists
        ? "CREATE"
        : row.existingLastSequence.compare(row.requiredLastSequence) < 0
            ? "INCREASE"
            : "UNCHANGED";
    if (action === "CREATE") created++;
    else if (action === "INCREASE") increased++;
    else unchanged++;

    print(EJSON.stringify({
        roomId: row._id,
        existingLastSequence: row.existingLastSequence,
        maxMembershipBoundary: row.maxMembershipBoundary,
        maxMessageSequence: row.maxMessageSequence,
        maxReadStateSequence: row.maxReadStateSequence,
        requiredLastSequence: row.requiredLastSequence,
        action,
    }, {relaxed: true}));

    if (mode === "apply" && action !== "UNCHANGED") {
        db.chat_room_sequences.updateOne(
            {_id: row._id},
            [{$set: {
                lastSequence: {$max: [
                    {$ifNull: ["$lastSequence", zero]},
                    row.requiredLastSequence,
                ]},
                boundaryRevision: {$ifNull: [
                    "$boundaryRevision", zero]},
            }}],
            {upsert: true});
    }
}

print(EJSON.stringify({
    mode,
    rooms: rows.length,
    created,
    increased,
    unchanged,
}, {relaxed: true}));
