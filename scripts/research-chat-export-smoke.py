#!/usr/bin/env python3
"""Smoke-check the local research Room chat export contract."""

import argparse
import hashlib
import io
import json
import pathlib
import socket
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile


EXPECTED_ENTRIES = {
    "metadata.json",
    "messages.jsonl",
    "message_changes.jsonl",
    "transcript.html",
}
METADATA_FIELDS = {"schemaVersion", "capturedAt", "room", "participants"}
ROOM_FIELDS = {
    "roomId", "name", "description", "categories", "status",
    "createdAt", "closedAt",
}
CATEGORY_FIELDS = {"categoryId", "name"}
PARTICIPANT_FIELDS = {"userId", "status", "messageCount"}
MESSAGE_FIELDS = {
    "messageSequence", "userId", "content", "createdAt", "deleted"
}
CHANGE_FIELDS = {
    "changeSequence", "messageSequence", "userId", "changeType",
    "content", "changedAt"
}
FORBIDDEN_FIELDS = {
    "messageId", "roomId", "state", "messageVersion",
    "senderMembershipId", "clientMessageId", "updatedAt", "deletedAt",
    "contentBeforeDeletion", "actorUserId", "actorType", "before",
    "after", "beforeContent", "afterContent", "auditEventId",
    "auditSchemaVersion", "displayName", "membershipId",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a local research Room chat export ZIP."
    )
    parser.add_argument("room_id")
    parser.add_argument("--base-url", default="http://localhost:8080")
    parser.add_argument("--researcher-id", default="research-smoke-user")
    parser.add_argument("--timeout-seconds", type=int, default=300)
    args = parser.parse_args()
    if args.timeout_seconds <= 0:
        parser.error("--timeout-seconds must be greater than 0")
    return args


def token(researcher_id: str) -> str:
    generator = pathlib.Path(__file__).with_name("generate-local-jwt.py")
    completed = subprocess.run(
        [sys.executable, str(generator), researcher_id,
         "--additional-scope", "chat:research:exports"],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def json_lines(raw: bytes, expected_fields: set[str]) -> list[dict]:
    if raw.startswith(b"\xef\xbb\xbf"):
        raise AssertionError("JSONL must not contain a UTF-8 BOM")
    text = raw.decode("utf-8")
    records = [json.loads(line) for line in text.splitlines()]
    for record in records:
        if set(record) != expected_fields:
            raise AssertionError(
                f"unexpected field set: {sorted(record)}"
            )
        leaked = set(record) & FORBIDDEN_FIELDS
        if leaked:
            raise AssertionError(f"forbidden fields: {sorted(leaked)}")
        if record["content"] is None:
            raise AssertionError("exported content must not be null")
    return records


def exact_fields(name: str, value: object, expected: set[str]) -> dict:
    if not isinstance(value, dict):
        raise AssertionError(f"{name} must be a JSON object")
    if set(value) != expected:
        raise AssertionError(
            f"unexpected {name} field set: {sorted(value)}"
        )
    return value


def validate_metadata(
    raw: bytes,
    expected_room_id: str,
    messages: list[dict],
) -> dict:
    if raw.startswith(b"\xef\xbb\xbf"):
        raise AssertionError("metadata.json must not contain a UTF-8 BOM")
    metadata = exact_fields(
        "metadata",
        json.loads(raw.decode("utf-8")),
        METADATA_FIELDS,
    )
    schema_version = metadata["schemaVersion"]
    if not isinstance(schema_version, int) \
            or isinstance(schema_version, bool) \
            or schema_version != 1:
        raise AssertionError("metadata schemaVersion must be 1")
    if not isinstance(metadata["capturedAt"], str) \
            or not metadata["capturedAt"]:
        raise AssertionError("metadata capturedAt must be a non-empty string")

    room = exact_fields("room", metadata["room"], ROOM_FIELDS)
    if room["roomId"] != expected_room_id:
        raise AssertionError("metadata roomId does not match request")
    if room["status"] not in {"ACTIVE", "CLOSED"}:
        raise AssertionError("metadata room status is invalid")
    if room["status"] == "ACTIVE" and room["closedAt"] is not None:
        raise AssertionError("ACTIVE Room closedAt must be null")
    if room["status"] == "CLOSED" and not room["closedAt"]:
        raise AssertionError("CLOSED Room closedAt must be present")
    if not isinstance(room["categories"], list):
        raise AssertionError("metadata room categories must be an array")
    for category in room["categories"]:
        exact_fields("category", category, CATEGORY_FIELDS)

    participants = metadata["participants"]
    if not isinstance(participants, list):
        raise AssertionError("metadata participants must be an array")
    participant_counts = {}
    for participant in participants:
        participant = exact_fields(
            "participant", participant, PARTICIPANT_FIELDS
        )
        user_id = participant["userId"]
        if not isinstance(user_id, str) or not user_id:
            raise AssertionError("participant userId must be non-empty")
        if user_id in participant_counts:
            raise AssertionError("participant userId must be unique")
        if participant["status"] not in {"ACTIVE", "LEFT", "BANNED"}:
            raise AssertionError("participant status is invalid")
        message_count = participant["messageCount"]
        if not isinstance(message_count, int) \
                or isinstance(message_count, bool) \
                or message_count < 0:
            raise AssertionError(
                "participant messageCount must be a non-negative integer"
            )
        participant_counts[user_id] = message_count

    actual_counts = {}
    for message in messages:
        user_id = message["userId"]
        actual_counts[user_id] = actual_counts.get(user_id, 0) + 1
    expected_counts = {
        user_id: actual_counts.get(user_id, 0)
        for user_id in participant_counts
    }
    if participant_counts != expected_counts \
            or set(actual_counts) - set(participant_counts):
        raise AssertionError(
            "participant messageCount does not match messages.jsonl"
        )
    return metadata


def main() -> int:
    args = arguments()
    url = (args.base_url.rstrip("/")
           + f"/api/v1/research/rooms/{args.room_id}/exports")
    request = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {token(args.researcher_id)}",
            "Accept": "application/zip",
        },
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=args.timeout_seconds,
        ) as response:
            status = response.status
            headers = response.headers
            artifact = response.read()
    except urllib.error.HTTPError as error:
        error.close()
        print(
            f"Research export request failed with HTTP {error.code}",
            file=sys.stderr,
        )
        return 1
    except (TimeoutError, socket.timeout):
        print(
            "Research export request timed out after "
            f"{args.timeout_seconds} seconds",
            file=sys.stderr,
        )
        return 1
    except urllib.error.URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            print(
                "Research export request timed out after "
                f"{args.timeout_seconds} seconds",
                file=sys.stderr,
            )
            return 1
        print(
            "Research export request could not reach the server "
            f"({type(error.reason).__name__})",
            file=sys.stderr,
        )
        return 1

    if status != 200:
        raise AssertionError(f"expected HTTP 200, got {status}")
    if headers.get_content_type() != "application/zip":
        raise AssertionError("Content-Type must be application/zip")
    if int(headers["Content-Length"]) != len(artifact):
        raise AssertionError("Content-Length does not match body")
    artifact_hash = hashlib.sha256(artifact).hexdigest()
    if headers["X-Export-SHA256"] != artifact_hash:
        raise AssertionError("whole ZIP SHA-256 does not match")
    export_id = headers["X-Export-Id"]
    expected_disposition = (
        f'attachment; filename="research-room-export-{export_id}.zip"'
    )
    if headers["Content-Disposition"] != expected_disposition:
        raise AssertionError("Content-Disposition does not match contract")
    if "no-store" not in {
        directive.strip().lower()
        for directive in headers.get("Cache-Control", "").split(",")
    }:
        raise AssertionError("Cache-Control must include no-store")
    if headers.get("Pragma") != "no-cache":
        raise AssertionError("Pragma must be no-cache")
    if headers.get("X-Content-Type-Options") != "nosniff":
        raise AssertionError("X-Content-Type-Options must be nosniff")

    with zipfile.ZipFile(io.BytesIO(artifact)) as archive:
        names = set(archive.namelist())
        if names != EXPECTED_ENTRIES or len(archive.namelist()) != 4:
            raise AssertionError(f"unexpected ZIP entries: {sorted(names)}")
        messages = json_lines(
            archive.read("messages.jsonl"), MESSAGE_FIELDS
        )
        changes = json_lines(
            archive.read("message_changes.jsonl"), CHANGE_FIELDS
        )
        validate_metadata(
            archive.read("metadata.json"), args.room_id, messages
        )

    message_sequences = [item["messageSequence"] for item in messages]
    change_sequences = [item["changeSequence"] for item in changes]
    if message_sequences != sorted(message_sequences):
        raise AssertionError("messages are not ordered by messageSequence")
    if change_sequences != sorted(change_sequences):
        raise AssertionError("changes are not ordered by changeSequence")
    print(
        f"OK exportId={export_id} messages={len(messages)} "
        f"changes={len(changes)} sha256={artifact_hash}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
