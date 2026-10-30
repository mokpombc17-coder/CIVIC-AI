#!/usr/bin/env python3
"""Validate the one-shot Super Admin Room chat export contract."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile


def generate_admin_token(subject: str) -> str:
    generator = os.path.join(os.path.dirname(__file__), "generate-local-jwt.py")
    return subprocess.check_output(
        [
            sys.executable,
            generator,
            subject,
            "--additional-scope",
            "chat:audit:exports",
        ],
        text=True,
    ).strip()


def request_export(base_url: str, room_id: str, token: str, mode: str):
    endpoint = f"{base_url.rstrip('/')}/api/v1/admin/rooms/{room_id}/exports"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps({"mode": mode}).encode("utf-8"),
        method="POST",
        headers={
            "Accept": "application/zip",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.headers, response.read()
        except urllib.error.HTTPError as exception:
            detail = exception.read().decode("utf-8", errors="replace")
            if exception.code == 503 and attempt < 4:
                time.sleep(0.1 * (attempt + 1))
                continue
            raise RuntimeError(
                f"{mode} export failed: HTTP {exception.code}: {detail}"
            ) from exception
    raise AssertionError("unreachable")


def validate_bundle(headers, payload: bytes, mode: str) -> dict:
    export_id = headers.get("X-Export-Id")
    expected_hash = headers.get("X-Export-SHA256")
    actual_hash = hashlib.sha256(payload).hexdigest()
    assert headers.get_content_type() == "application/zip"
    assert export_id
    assert expected_hash == actual_hash
    assert int(headers.get("Content-Length")) == len(payload)
    assert "no-store" in headers.get("Cache-Control", "")
    assert headers.get("X-Content-Type-Options") == "nosniff"

    html_name = "transcript.html" if mode == "FULL" else "changes.html"
    expected_entries = {
        "manifest.json",
        "room.json",
        "participants.jsonl",
        "events.jsonl",
        html_name,
    }
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        assert set(archive.namelist()) == expected_entries
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["mode"] == mode
        assert manifest["exportId"] == export_id
        assert manifest["fromChangeSequenceExclusive"] <= manifest[
            "toChangeSequenceInclusive"
        ]
        for descriptor in manifest["files"]:
            content = archive.read(descriptor["name"])
            assert len(content) == descriptor["sizeBytes"]
            assert hashlib.sha256(content).hexdigest() == descriptor["sha256"]
        for line in archive.read("events.jsonl").splitlines():
            event = json.loads(line)
            assert event["roomId"] == manifest["roomId"]
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default=os.getenv("CHAT_BASE_URL", "http://localhost:8080"),
    )
    parser.add_argument("--room-id", default=os.getenv("CHAT_EXPORT_ROOM_ID"))
    parser.add_argument("--token", default=os.getenv("CHAT_ADMIN_TOKEN"))
    parser.add_argument("--subject", default="local-super-admin")
    parser.add_argument(
        "--skip-incremental", action="store_true", help="Only validate FULL"
    )
    arguments = parser.parse_args()
    if not arguments.room_id:
        parser.error("--room-id or CHAT_EXPORT_ROOM_ID is required")
    token = arguments.token or generate_admin_token(arguments.subject)

    full_headers, full_payload = request_export(
        arguments.base_url, arguments.room_id, token, "FULL"
    )
    full = validate_bundle(full_headers, full_payload, "FULL")
    print(
        "FULL export validated:",
        full["exportId"],
        full["toChangeSequenceInclusive"],
    )

    if not arguments.skip_incremental:
        incremental_headers, incremental_payload = request_export(
            arguments.base_url,
            arguments.room_id,
            token,
            "INCREMENTAL",
        )
        incremental = validate_bundle(
            incremental_headers, incremental_payload, "INCREMENTAL"
        )
        assert incremental["baseExportId"] == full["exportId"]
        assert incremental["fromChangeSequenceExclusive"] == full[
            "toChangeSequenceInclusive"
        ]
        print(
            "INCREMENTAL export validated:",
            incremental["exportId"],
            incremental["toChangeSequenceInclusive"],
        )


if __name__ == "__main__":
    main()
