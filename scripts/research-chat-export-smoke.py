#!/usr/bin/env python3
"""Smoke-check the local research Room chat export contract."""

import argparse
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile


EXPECTED_ENTRIES = {
    "manifest.json",
    "messages.jsonl",
    "message_changes.jsonl",
    "transcript.html",
}
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
    return parser.parse_args()


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
        with urllib.request.urlopen(request) as response:
            status = response.status
            headers = response.headers
            artifact = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code}: {detail}", file=sys.stderr)
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

    with zipfile.ZipFile(io.BytesIO(artifact)) as archive:
        names = set(archive.namelist())
        if names != EXPECTED_ENTRIES or len(archive.namelist()) != 4:
            raise AssertionError(f"unexpected ZIP entries: {sorted(names)}")
        manifest = json.loads(archive.read("manifest.json"))
        descriptors = {item["name"]: item for item in manifest["files"]}
        expected_descriptors = EXPECTED_ENTRIES - {"manifest.json"}
        if set(descriptors) != expected_descriptors:
            raise AssertionError("manifest file descriptors do not match")
        for name, descriptor in descriptors.items():
            raw = archive.read(name)
            if descriptor["sizeBytes"] != len(raw):
                raise AssertionError(f"size mismatch for {name}")
            if descriptor["sha256"] != hashlib.sha256(raw).hexdigest():
                raise AssertionError(f"SHA-256 mismatch for {name}")

        messages = json_lines(
            archive.read("messages.jsonl"), MESSAGE_FIELDS
        )
        changes = json_lines(
            archive.read("message_changes.jsonl"), CHANGE_FIELDS
        )

    message_sequences = [item["messageSequence"] for item in messages]
    change_sequences = [item["changeSequence"] for item in changes]
    if message_sequences != sorted(message_sequences):
        raise AssertionError("messages are not ordered by messageSequence")
    if change_sequences != sorted(change_sequences):
        raise AssertionError("changes are not ordered by changeSequence")
    if manifest["counts"]["messages"] != len(messages):
        raise AssertionError("manifest message count does not match")
    if manifest["counts"]["changes"] != len(changes):
        raise AssertionError("manifest change count does not match")

    print(
        f"OK exportId={export_id} messages={len(messages)} "
        f"changes={len(changes)} sha256={artifact_hash}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
