#!/usr/bin/env python3

import argparse
import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


COOKIE_NAME = "civic_ai_access_token"
DEFAULT_BASE_URL = "http://localhost:8082"
DEFAULT_ORIGIN = "http://localhost:3000"
DEFAULT_SUBJECT = "local-user-1"


def generate_token(subject: str) -> str:
    generator = os.path.join(os.path.dirname(__file__), "generate-local-jwt.py")
    return subprocess.check_output(
        [sys.executable, generator, subject],
        text=True,
    ).strip()


class HttpClient:
    def __init__(self, base_url: str, origin: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.origin = origin
        self.cookie = f"{COOKIE_NAME}={token}"

    def request(
        self,
        method: str,
        path: str,
        *,
        body: dict | None = None,
        headers: dict[str, str] | None = None,
        expected_statuses: tuple[int, ...] = (200,),
        authenticated: bool = True,
    ) -> tuple[int, dict[str, str], object | None]:
        request_headers = {"Origin": self.origin}
        if authenticated:
            request_headers["Cookie"] = self.cookie
        if headers:
            request_headers.update(headers)

        payload = None
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=payload,
            headers=request_headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                status = response.status
                response_headers = {
                    key.lower(): value for key, value in response.headers.items()
                }
                raw_body = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            response_headers = {
                key.lower(): value for key, value in error.headers.items()
            }
            raw_body = error.read()
        except urllib.error.URLError as error:
            raise RuntimeError(
                f"{self.base_url}에 연결할 수 없습니다. "
                "docker compose -f compose.local.yaml up --build -d를 먼저 실행해 주세요."
            ) from error

        if status not in expected_statuses:
            detail = raw_body.decode("utf-8", errors="replace")
            raise AssertionError(
                f"{method} {path}: expected {expected_statuses}, got {status}: {detail}"
            )

        parsed_body = None
        if raw_body:
            content_type = response_headers.get("content-type", "")
            if "json" in content_type:
                parsed_body = json.loads(raw_body)
            else:
                parsed_body = raw_body.decode("utf-8", errors="replace")
        return status, response_headers, parsed_body


def find_public_room(
    client: HttpClient,
    room_id: str,
    *,
    query_parameters: dict[str, str] | None = None,
) -> dict | None:
    cursor = None
    seen_cursors: set[str] = set()
    parameters = dict(query_parameters or {})
    parameters["limit"] = "100"
    while True:
        query = dict(parameters)
        if cursor is not None:
            query["cursor"] = cursor
        path = "/api/v1/rooms?" + urllib.parse.urlencode(query)
        _, _, page = client.request("GET", path)
        if not isinstance(page, dict):
            raise AssertionError("공개 방 목록 응답이 JSON 객체가 아닙니다.")

        found = next(
            (
                item
                for item in page.get("items", [])
                if item.get("roomId") == room_id
            ),
            None,
        )
        if found is not None or not page.get("hasNext"):
            return found

        next_cursor = page.get("nextCursor")
        if (
            not isinstance(next_cursor, str)
            or not next_cursor
            or next_cursor in seen_cursors
        ):
            raise AssertionError("공개 방 목록 cursor 계약이 유효하지 않습니다.")
        seen_cursors.add(next_cursor)
        cursor = next_cursor


class WebSocketClient:
    def __init__(self, url: str, origin: str, cookie: str):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "ws":
            raise ValueError("로컬 스모크 테스트는 ws:// URL만 지원합니다.")

        self.host = parsed.hostname or "localhost"
        self.port = parsed.port or 80
        self.path = parsed.path or "/"
        if parsed.query:
            self.path += f"?{parsed.query}"
        self.origin = origin
        self.cookie = cookie
        self.socket: socket.socket | None = None
        self.buffer = bytearray()

    def connect(self) -> None:
        web_socket_key = base64.b64encode(os.urandom(16)).decode("ascii")
        connection = socket.create_connection((self.host, self.port), timeout=10)
        connection.settimeout(10)
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {web_socket_key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            f"Origin: {self.origin}\r\n"
            f"Cookie: {self.cookie}\r\n"
            "\r\n"
        )
        connection.sendall(request.encode("ascii"))

        response = bytearray()
        while b"\r\n\r\n" not in response:
            chunk = connection.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket handshake 응답이 중간에 종료됐습니다.")
            response.extend(chunk)

        header_bytes, remaining = response.split(b"\r\n\r\n", 1)
        header_text = header_bytes.decode("iso-8859-1")
        status_line, *header_lines = header_text.split("\r\n")
        if " 101 " not in status_line:
            raise AssertionError(f"WebSocket handshake failed: {status_line}")

        response_headers = {}
        for line in header_lines:
            key, value = line.split(":", 1)
            response_headers[key.strip().lower()] = value.strip()

        expected_accept = base64.b64encode(
            hashlib.sha1(
                (
                    web_socket_key
                    + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
                ).encode("ascii")
            ).digest()
        ).decode("ascii")
        if response_headers.get("sec-websocket-accept") != expected_accept:
            raise AssertionError("WebSocket Sec-WebSocket-Accept 값이 올바르지 않습니다.")

        self.socket = connection
        self.buffer.extend(remaining)

    def close(self) -> None:
        if self.socket is None:
            return
        try:
            self.send_frame(b"", opcode=0x8)
        except OSError:
            pass
        self.socket.close()
        self.socket = None

    def send_text(self, value: str) -> None:
        self.send_frame(value.encode("utf-8"), opcode=0x1)

    def send_frame(self, payload: bytes, *, opcode: int) -> None:
        if self.socket is None:
            raise RuntimeError("WebSocket이 연결되지 않았습니다.")

        first_byte = 0x80 | opcode
        length = len(payload)
        if length < 126:
            header = bytes((first_byte, 0x80 | length))
        elif length <= 0xFFFF:
            header = bytes((first_byte, 0x80 | 126)) + struct.pack("!H", length)
        else:
            header = bytes((first_byte, 0x80 | 127)) + struct.pack("!Q", length)

        mask = os.urandom(4)
        masked_payload = bytes(
            value ^ mask[index % 4] for index, value in enumerate(payload)
        )
        self.socket.sendall(header + mask + masked_payload)

    def receive_text(self) -> str:
        fragments = bytearray()
        while True:
            opcode, final, payload = self.receive_frame()
            if opcode == 0x8:
                raise RuntimeError("서버가 WebSocket 연결을 종료했습니다.")
            if opcode == 0x9:
                self.send_frame(payload, opcode=0xA)
                continue
            if opcode == 0xA:
                continue
            if opcode not in (0x0, 0x1):
                continue
            fragments.extend(payload)
            if final:
                return fragments.decode("utf-8")

    def receive_frame(self) -> tuple[int, bool, bytes]:
        first, second = self.read_exact(2)
        final = bool(first & 0x80)
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", self.read_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self.read_exact(8))[0]

        mask = self.read_exact(4) if masked else b""
        payload = self.read_exact(length)
        if masked:
            payload = bytes(
                value ^ mask[index % 4] for index, value in enumerate(payload)
            )
        return opcode, final, payload

    def read_exact(self, length: int) -> bytes:
        if self.socket is None:
            raise RuntimeError("WebSocket이 연결되지 않았습니다.")
        while len(self.buffer) < length:
            chunk = self.socket.recv(max(4096, length - len(self.buffer)))
            if not chunk:
                raise RuntimeError("WebSocket frame 수신이 중간에 종료됐습니다.")
            self.buffer.extend(chunk)
        result = bytes(self.buffer[:length])
        del self.buffer[:length]
        return result


def stomp_frame(
    command: str,
    headers: dict[str, str] | None = None,
    body: str = "",
) -> str:
    lines = [command]
    if headers:
        lines.extend(f"{key}:{value}" for key, value in headers.items())
    lines.extend(("", body))
    return "\n".join(lines) + "\x00"


def parse_stomp_frame(value: str) -> tuple[str, dict[str, str], str]:
    value = value.lstrip("\n")
    if "\x00" in value:
        value = value.split("\x00", 1)[0]
    header_block, _, body = value.partition("\n\n")
    lines = header_block.splitlines()
    if not lines:
        raise AssertionError("빈 STOMP frame을 수신했습니다.")
    headers = {}
    for line in lines[1:]:
        key, separator, item = line.partition(":")
        if separator:
            headers[key] = item
    return lines[0], headers, body


def receive_stomp(
    client: WebSocketClient,
    *,
    expected_commands: tuple[str, ...],
    deadline: float,
) -> tuple[str, dict[str, str], str]:
    while time.monotonic() < deadline:
        command, headers, body = parse_stomp_frame(client.receive_text())
        if command == "ERROR":
            raise AssertionError(f"STOMP ERROR: {headers} {body}")
        if command in expected_commands:
            return command, headers, body
    raise TimeoutError(f"STOMP {expected_commands} frame을 기다리다 시간 초과됐습니다.")


def assert_authentication_required(
    ws_url: str,
    origin: str,
    cookie: str,
    attempt_name: str,
) -> None:
    client = WebSocketClient(ws_url, origin, cookie)
    try:
        client.connect()
        client.send_text(
            stomp_frame(
                "CONNECT",
                {
                    "accept-version": "1.2",
                    "heart-beat": "0,0",
                },
            )
        )
        command, headers, body = parse_stomp_frame(client.receive_text())
        if command != "ERROR":
            raise AssertionError(
                f"{attempt_name} 인증 실패가 ERROR frame이 아닙니다: {command}"
            )
        if headers.get("message") != "AUTHENTICATION_REQUIRED":
            raise AssertionError(
                f"{attempt_name} 인증 오류 code가 다릅니다: {headers}"
            )
        if headers.get("content-type") != "application/json":
            raise AssertionError(
                f"{attempt_name} 인증 오류 content-type이 다릅니다: {headers}"
            )
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as error:
            raise AssertionError(
                f"{attempt_name} 인증 오류 body가 JSON이 아닙니다: {body}"
            ) from error
        if payload != {
            "code": "AUTHENTICATION_REQUIRED",
            "retryable": False,
        }:
            raise AssertionError(
                f"{attempt_name} 인증 오류 payload가 다릅니다: {payload}"
            )
    finally:
        client.close()


def assert_websocket_authentication_reconnect_contract(
    ws_url: str,
    origin: str,
    valid_cookie: str,
) -> None:
    invalid_cookie = f"{COOKIE_NAME}=not-a-jwt"
    assert_authentication_required(
        ws_url,
        origin,
        invalid_cookie,
        "최초 CONNECT",
    )
    assert_authentication_required(
        ws_url,
        origin,
        invalid_cookie,
        "새 연결의 자동 reconnect CONNECT",
    )

    authenticated_client = WebSocketClient(ws_url, origin, valid_cookie)
    try:
        authenticated_client.connect()
        connect_stomp(authenticated_client)
    finally:
        authenticated_client.close()


def assert_cors(client: HttpClient) -> None:
    _, headers, _ = client.request(
        "OPTIONS",
        "/api/v1/rooms",
        headers={
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,idempotency-key",
        },
        expected_statuses=(200, 204),
        authenticated=False,
    )
    if headers.get("access-control-allow-origin") != client.origin:
        raise AssertionError("CORS allowed origin이 로컬 프론트 origin과 다릅니다.")
    if headers.get("access-control-allow-credentials", "").lower() != "true":
        raise AssertionError("CORS credentials 허용 응답이 없습니다.")

    allowed_headers = {
        item.strip().lower()
        for item in headers.get("access-control-allow-headers", "").split(",")
    }
    if not {"content-type", "idempotency-key"} <= allowed_headers:
        raise AssertionError("CORS allowed headers 계약이 충족되지 않았습니다.")

    allowed_methods = {
        item.strip().upper()
        for item in headers.get("access-control-allow-methods", "").split(",")
    }
    if not {"GET", "POST", "PUT", "OPTIONS"} <= allowed_methods:
        raise AssertionError("CORS allowed methods 계약이 충족되지 않았습니다.")


def run_websocket_flow(
    ws_url: str,
    origin: str,
    cookie: str,
    http_client: HttpClient,
    room_id: str,
    subject: str,
    self_membership_id: str,
) -> tuple[str, str, int, str, int]:
    client = WebSocketClient(ws_url, origin, cookie)
    client.connect()
    try:
        client.send_text(
            stomp_frame(
                "CONNECT",
                {
                    "accept-version": "1.2",
                    "heart-beat": "10000,10000",
                },
            )
        )
        receive_stomp(
            client,
            expected_commands=("CONNECTED",),
            deadline=time.monotonic() + 10,
        )
        print("       STOMP CONNECTED")

        subscriptions = (
            ("command-results", "/user/queue/command-results"),
            ("system-events", "/user/queue/system-events"),
            ("room-inbox-events", "/user/queue/room-inbox-events"),
            ("room-messages", f"/topic/rooms/{room_id}/messages"),
            ("room-events", f"/topic/rooms/{room_id}/room-events"),
        )
        for subscription_id, destination in subscriptions:
            client.send_text(
                stomp_frame(
                    "SUBSCRIBE",
                    {
                        "id": subscription_id,
                        "destination": destination,
                        "ack": "auto",
                    },
                )
            )
            print(f"       SUBSCRIBED {destination}")

        sync_request_id = str(uuid.uuid4())
        sync_body = json.dumps({"requestId": sync_request_id})
        client.send_text(
            stomp_frame(
                "SEND",
                {
                    "destination": (
                        f"/app/rooms/{room_id}/subscriptions/sync"
                    ),
                    "content-type": "application/json",
                    "content-length": str(
                        len(sync_body.encode("utf-8"))
                    ),
                },
                sync_body,
            )
        )

        ready = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and ready is None:
            _, _, body = receive_stomp(
                client,
                expected_commands=("MESSAGE",),
                deadline=deadline,
            )
            document = json.loads(body)
            if (
                document.get("eventType")
                == "ROOM_SUBSCRIPTIONS_READY"
                and document.get("requestId") == sync_request_id
            ):
                ready = document
            elif document.get("status") == "REJECTED":
                raise AssertionError(
                    f"구독 준비 sync가 거절됐습니다: {document}"
                )

        if ready is None:
            raise AssertionError(
                "ROOM_SUBSCRIPTIONS_READY 이벤트를 받지 못했습니다."
            )
        if ready.get("roomId") != room_id:
            raise AssertionError("구독 준비 응답의 roomId가 다릅니다.")
        if ready.get("messageVisibleAfterSequence") != 0:
            raise AssertionError(
                "방장의 messageVisibleAfterSequence는 0이어야 합니다."
            )
        if ready.get("watermarkSequence") != 0:
            raise AssertionError(
                "새 방의 구독 준비 watermarkSequence는 0이어야 합니다."
            )
        print("       ROOM SUBSCRIPTIONS READY")

        settings_key = str(uuid.uuid4())
        updated_room_name = f"frontend-smoke-updated-{uuid.uuid4().hex[:8]}"
        updated_description = "frontend local smoke updated description"
        _, _, settings_result = http_client.request(
            "POST",
            f"/api/v1/rooms/{room_id}/commands/update-settings",
            body={
                "name": updated_room_name,
                "description": updated_description,
                "categories": ["ENVIRONMENT"],
                "visibility": "UNLISTED",
                "joinPolicy": "INVITE_ONLY",
            },
            headers={"Idempotency-Key": settings_key},
        )
        if (
            not isinstance(settings_result, dict)
            or settings_result.get("code") != "ROOM_SETTINGS_UPDATED"
            or settings_result.get("replayed") is not False
            or settings_result.get("name") != updated_room_name
            or settings_result.get("description") != updated_description
            or settings_result.get("categories") != ["ENVIRONMENT"]
            or settings_result.get("visibility") != "UNLISTED"
            or settings_result.get("joinPolicy") != "INVITE_ONLY"
        ):
            raise AssertionError(
                f"Room settings update 응답이 올바르지 않습니다: {settings_result}"
            )

        settings_event = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and settings_event is None:
            _, _, body = receive_stomp(
                client,
                expected_commands=("MESSAGE",),
                deadline=deadline,
            )
            document = json.loads(body)
            if (
                document.get("eventType") == "ROOM_SETTINGS_UPDATED"
                and document.get("payload", {}).get("roomId") == room_id
            ):
                settings_event = document
        if settings_event is None:
            raise AssertionError("ROOM_SETTINGS_UPDATED 이벤트를 받지 못했습니다.")
        if settings_event.get("eventVersion") != 2:
            raise AssertionError(
                f"Room event 버전이 올바르지 않습니다: {settings_event}"
            )
        settings_payload = settings_event["payload"]
        if (
            settings_payload.get("name") != updated_room_name
            or settings_payload.get("description") != updated_description
            or settings_payload.get("categories") != ["ENVIRONMENT"]
            or settings_payload.get("visibility") != "UNLISTED"
            or settings_payload.get("joinPolicy") != "INVITE_ONLY"
            or settings_payload.get("roomVersion")
            != settings_result.get("roomVersion")
        ):
            raise AssertionError(
                f"Room settings event snapshot이 올바르지 않습니다: {settings_payload}"
            )

        _, _, settings_replay = http_client.request(
            "POST",
            f"/api/v1/rooms/{room_id}/commands/update-settings",
            body={
                "name": updated_room_name,
                "description": updated_description,
                "categories": ["ENVIRONMENT"],
                "visibility": "UNLISTED",
                "joinPolicy": "INVITE_ONLY",
            },
            headers={"Idempotency-Key": settings_key},
        )
        if (
            not isinstance(settings_replay, dict)
            or settings_replay.get("code") != "ROOM_SETTINGS_UPDATED"
            or settings_replay.get("replayed") is not True
            or settings_replay.get("roomVersion")
            != settings_result.get("roomVersion")
        ):
            raise AssertionError(
                f"Room settings replay가 올바르지 않습니다: {settings_replay}"
            )

        _, _, settings_noop = http_client.request(
            "POST",
            f"/api/v1/rooms/{room_id}/commands/update-settings",
            body={"description": updated_description},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        if (
            not isinstance(settings_noop, dict)
            or settings_noop.get("code") != "ROOM_SETTINGS_UNCHANGED"
            or settings_noop.get("roomVersion")
            != settings_result.get("roomVersion")
        ):
            raise AssertionError(
                f"Room settings no-op이 올바르지 않습니다: {settings_noop}"
            )
        print("       ROOM SETTINGS UPDATED / REPLAYED / UNCHANGED")

        client_message_id = str(uuid.uuid4())
        message_body = json.dumps(
            {
                "clientMessageId": client_message_id,
                "content": "frontend-local-smoke",
            }
        )
        client.send_text(
            stomp_frame(
                "SEND",
                {
                    "destination": f"/app/rooms/{room_id}/messages",
                    "content-type": "application/json",
                    "content-length": str(len(message_body.encode("utf-8"))),
                },
                message_body,
            )
        )
        print("       MESSAGE SENT")

        command_result = None
        message_event = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and (
            command_result is None or message_event is None
        ):
            command, _, body = receive_stomp(
                client,
                expected_commands=("MESSAGE",),
                deadline=deadline,
            )
            if command != "MESSAGE":
                continue
            document = json.loads(body)
            if document.get("clientMessageId") == client_message_id:
                command_result = document
            elif (
                document.get("eventType") == "CHAT_MESSAGE_CREATED"
                and document.get("payload", {}).get("clientMessageId")
                == client_message_id
            ):
                message_event = document

        if command_result is None or command_result.get("status") != "ACCEPTED":
            raise AssertionError(f"메시지 command 결과가 올바르지 않습니다: {command_result}")
        if message_event is None:
            raise AssertionError("CHAT_MESSAGE_CREATED 이벤트를 받지 못했습니다.")

        payload = message_event["payload"]
        if "senderUserId" in payload:
            raise AssertionError("메시지 이벤트에 senderUserId가 노출됐습니다.")
        if message_event.get("eventVersion") != 2:
            raise AssertionError(
                f"메시지 이벤트 버전이 올바르지 않습니다: {message_event}"
            )
        if payload.get("senderMembershipId") != self_membership_id:
            raise AssertionError(
                "메시지 이벤트 senderMembershipId가 현재 Membership과 다릅니다."
            )
        message_id = payload["messageId"]
        room_sequence = int(payload["roomSequence"])
        if payload.get("state") != "ACTIVE" or payload.get("messageVersion") != 1:
            raise AssertionError(f"신규 메시지 state/version이 올바르지 않습니다: {payload}")

        edit_mutation_id = str(uuid.uuid4())
        edit_body = json.dumps(
            {
                "clientMutationId": edit_mutation_id,
                "messageId": message_id,
                "content": "frontend-local-smoke-edited",
            }
        )
        client.send_text(
            stomp_frame(
                "SEND",
                {
                    "destination": f"/app/rooms/{room_id}/messages/edit",
                    "content-type": "application/json",
                    "content-length": str(len(edit_body.encode("utf-8"))),
                },
                edit_body,
            )
        )
        edit_result = None
        update_event = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and (
            edit_result is None or update_event is None
        ):
            _, _, body = receive_stomp(
                client,
                expected_commands=("MESSAGE",),
                deadline=deadline,
            )
            document = json.loads(body)
            if document.get("clientMutationId") == edit_mutation_id:
                edit_result = document
            elif (
                document.get("eventType") == "CHAT_MESSAGE_UPDATED"
                and document.get("payload", {}).get("messageId")
                == message_id
            ):
                update_event = document
        if edit_result is None or edit_result.get("status") != "UPDATED":
            raise AssertionError(f"수정 command 결과가 올바르지 않습니다: {edit_result}")
        if update_event is None:
            raise AssertionError("CHAT_MESSAGE_UPDATED 이벤트를 받지 못했습니다.")
        updated = update_event["payload"]
        if (
            updated.get("messageVersion") != 2
            or updated.get("roomSequence") != room_sequence
            or updated.get("content") != "frontend-local-smoke-edited"
        ):
            raise AssertionError(f"수정 event snapshot이 올바르지 않습니다: {updated}")

        delete_mutation_id = str(uuid.uuid4())
        delete_body = json.dumps(
            {
                "clientMutationId": delete_mutation_id,
                "messageId": message_id,
            }
        )
        client.send_text(
            stomp_frame(
                "SEND",
                {
                    "destination": f"/app/rooms/{room_id}/messages/delete",
                    "content-type": "application/json",
                    "content-length": str(len(delete_body.encode("utf-8"))),
                },
                delete_body,
            )
        )
        delete_result = None
        delete_event = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and (
            delete_result is None or delete_event is None
        ):
            _, _, body = receive_stomp(
                client,
                expected_commands=("MESSAGE",),
                deadline=deadline,
            )
            document = json.loads(body)
            if document.get("clientMutationId") == delete_mutation_id:
                delete_result = document
            elif (
                document.get("eventType") == "CHAT_MESSAGE_DELETED"
                and document.get("payload", {}).get("messageId")
                == message_id
            ):
                delete_event = document
        if delete_result is None or delete_result.get("status") != "DELETED":
            raise AssertionError(f"삭제 command 결과가 올바르지 않습니다: {delete_result}")
        if delete_event is None:
            raise AssertionError("CHAT_MESSAGE_DELETED 이벤트를 받지 못했습니다.")
        deleted = delete_event["payload"]
        if (
            deleted.get("messageVersion") != 3
            or deleted.get("roomSequence") != room_sequence
            or deleted.get("state") != "DELETED_BY_AUTHOR"
            or deleted.get("content") is not None
        ):
            raise AssertionError(f"삭제 tombstone event가 올바르지 않습니다: {deleted}")

        next_client_message_id = str(uuid.uuid4())
        next_body = json.dumps(
            {
                "clientMessageId": next_client_message_id,
                "content": "frontend-local-smoke-next",
            }
        )
        client.send_text(
            stomp_frame(
                "SEND",
                {
                    "destination": f"/app/rooms/{room_id}/messages",
                    "content-type": "application/json",
                    "content-length": str(len(next_body.encode("utf-8"))),
                },
                next_body,
            )
        )
        next_result = None
        next_event = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and (
            next_result is None or next_event is None
        ):
            _, _, body = receive_stomp(
                client,
                expected_commands=("MESSAGE",),
                deadline=deadline,
            )
            document = json.loads(body)
            if document.get("clientMessageId") == next_client_message_id:
                next_result = document
            elif (
                document.get("eventType") == "CHAT_MESSAGE_CREATED"
                and document.get("payload", {}).get("clientMessageId")
                == next_client_message_id
            ):
                next_event = document
        if next_result is None or next_result.get("status") != "ACCEPTED":
            raise AssertionError(f"후속 메시지 command 결과가 올바르지 않습니다: {next_result}")
        if next_event is None:
            raise AssertionError("후속 CHAT_MESSAGE_CREATED 이벤트를 받지 못했습니다.")
        next_sequence = int(next_event["payload"]["roomSequence"])
        if next_sequence != room_sequence + 1:
            raise AssertionError(
                "수정·삭제가 roomSequence를 소비했습니다: "
                f"original={room_sequence}, next={next_sequence}"
            )
        return (
            client_message_id,
            message_id,
            room_sequence,
            next_client_message_id,
            next_sequence,
        )
    finally:
        client.close()


def find_inbox_room(client: HttpClient, room_id: str) -> dict | None:
    cursor = None
    while True:
        query = {"limit": "20"}
        if cursor is not None:
            query["cursor"] = cursor
        _, _, page = client.request(
            "GET",
            "/api/v1/me/room-inbox?" + urllib.parse.urlencode(query),
        )
        found = next(
            (
                item
                for item in page.get("items", [])
                if item.get("roomId") == room_id
            ),
            None,
        )
        if found is not None or not page.get("hasNext"):
            return found
        cursor = page.get("nextCursor")
        if not isinstance(cursor, str) or not cursor:
            raise AssertionError("room-inbox cursor 계약이 유효하지 않습니다.")


def connect_stomp(client: WebSocketClient) -> None:
    client.connect()
    client.send_text(
        stomp_frame(
            "CONNECT",
            {"accept-version": "1.2", "heart-beat": "10000,10000"},
        )
    )
    receive_stomp(
        client,
        expected_commands=("CONNECTED",),
        deadline=time.monotonic() + 10,
    )


def subscribe_stomp(
    client: WebSocketClient,
    subscription_id: str,
    destination: str,
) -> None:
    client.send_text(
        stomp_frame(
            "SUBSCRIBE",
            {
                "id": subscription_id,
                "destination": destination,
                "ack": "auto",
            },
        )
    )


def receive_json_matching(
    client: WebSocketClient,
    predicate,
    description: str,
) -> dict:
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        _, _, body = receive_stomp(
            client,
            expected_commands=("MESSAGE",),
            deadline=deadline,
        )
        document = json.loads(body)
        if predicate(document):
            return document
    raise TimeoutError(f"{description} 이벤트를 기다리다 시간 초과됐습니다.")


def run_room_inbox_flow(
    ws_url: str,
    origin: str,
    owner_client: HttpClient,
    member_client: HttpClient,
    room_id: str,
) -> None:
    _, _, member_membership = member_client.request(
        "GET", f"/api/v1/rooms/{room_id}/memberships/me"
    )
    member_membership_id = member_membership.get("membershipId")
    if not isinstance(member_membership_id, str) or not member_membership_id:
        raise AssertionError("inbox smoke member membershipId가 없습니다.")

    owner_ws = WebSocketClient(ws_url, origin, owner_client.cookie)
    member_ws = WebSocketClient(ws_url, origin, member_client.cookie)
    connect_stomp(owner_ws)
    connect_stomp(member_ws)
    try:
        subscribe_stomp(
            owner_ws,
            "room-inbox-events",
            "/user/queue/room-inbox-events",
        )
        subscribe_stomp(
            owner_ws,
            "room-messages",
            f"/topic/rooms/{room_id}/messages",
        )
        subscribe_stomp(
            member_ws,
            "command-results",
            "/user/queue/command-results",
        )

        def create_member_message(content: str) -> tuple[str, int, dict]:
            client_message_id = str(uuid.uuid4())
            body = json.dumps(
                {"clientMessageId": client_message_id, "content": content}
            )
            member_ws.send_text(
                stomp_frame(
                    "SEND",
                    {
                        "destination": f"/app/rooms/{room_id}/messages",
                        "content-type": "application/json",
                        "content-length": str(len(body.encode("utf-8"))),
                    },
                    body,
                )
            )
            result = receive_json_matching(
                member_ws,
                lambda value: value.get("clientMessageId")
                == client_message_id,
                "member message command result",
            )
            if result.get("status") != "ACCEPTED":
                raise AssertionError(f"member CREATE가 실패했습니다: {result}")
            inbox_event = receive_json_matching(
                owner_ws,
                lambda value: value.get("eventType")
                == "ROOM_INBOX_INVALIDATED"
                and value.get("cause") == "MESSAGE_CREATED"
                and value.get("notificationHint", {}).get("messageId")
                == result.get("messageId"),
                "개인 inbox CREATE",
            )
            if (
                "payload" in inbox_event
                or inbox_event.get("eventVersion") != 2
                or inbox_event.get("coalescedCreateCount") != 1
                or not inbox_event.get("sourceEventIds")
            ):
                raise AssertionError(
                    f"개인 inbox event가 cache payload처럼 보입니다: {inbox_event}"
                )
            notification_hint = inbox_event["notificationHint"]
            if "senderUserId" in notification_hint:
                raise AssertionError(
                    "개인 inbox notificationHint에 senderUserId가 노출됐습니다."
                )
            if notification_hint.get("senderMembershipId") != member_membership_id:
                raise AssertionError(
                    "개인 inbox notificationHint senderMembershipId가 다릅니다."
                )
            return result["messageId"], int(result["roomSequence"]), inbox_event

        first_message_id, first_sequence, _ = create_member_message(
            "frontend inbox unread"
        )
        inbox = find_inbox_room(owner_client, room_id)
        if inbox is None or inbox.get("unreadCount") != 1:
            raise AssertionError(f"다른 사용자 메시지 unread가 1이 아닙니다: {inbox}")
        _, _, read_result = owner_client.request(
            "PUT",
            f"/api/v1/rooms/{room_id}/read-state",
            body={"throughSequence": first_sequence},
        )
        if (
            read_result.get("readThroughSequence") != first_sequence
            or not read_result.get("updated")
        ):
            raise AssertionError(f"read-state 증가 응답이 다릅니다: {read_result}")
        if find_inbox_room(owner_client, room_id).get("unreadCount") != 0:
            raise AssertionError("read-state PUT 이후 unreadCount가 0이 아닙니다.")

        second_message_id, _, _ = create_member_message(
            "frontend inbox delete"
        )
        if find_inbox_room(owner_client, room_id).get("unreadCount") != 1:
            raise AssertionError("삭제 전 두 번째 unreadCount가 1이 아닙니다.")
        mutation_id = str(uuid.uuid4())
        delete_body = json.dumps(
            {
                "clientMutationId": mutation_id,
                "messageId": second_message_id,
            }
        )
        member_ws.send_text(
            stomp_frame(
                "SEND",
                {
                    "destination": f"/app/rooms/{room_id}/messages/delete",
                    "content-type": "application/json",
                    "content-length": str(len(delete_body.encode("utf-8"))),
                },
                delete_body,
            )
        )
        delete_result = receive_json_matching(
            member_ws,
            lambda value: value.get("clientMutationId") == mutation_id,
            "member DELETE command result",
        )
        if delete_result.get("status") != "DELETED":
            raise AssertionError(f"member DELETE가 실패했습니다: {delete_result}")
        delete_event = receive_json_matching(
            owner_ws,
            lambda value: value.get("eventType")
            == "ROOM_INBOX_INVALIDATED"
            and value.get("cause") == "MESSAGE_DELETED",
            "개인 inbox DELETE",
        )
        if delete_event.get("notificationHint") is not None:
            raise AssertionError("DELETE invalidation에 preview가 포함됐습니다.")
        if find_inbox_room(owner_client, room_id).get("unreadCount") != 0:
            raise AssertionError("읽지 않은 메시지 삭제 후 unreadCount가 0이 아닙니다.")
    finally:
        owner_ws.close()
        member_ws.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the complete local frontend integration contract."
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--subject", default=DEFAULT_SUBJECT)
    parser.add_argument("--ws-url")
    args = parser.parse_args()

    parsed_base_url = urllib.parse.urlparse(args.base_url)
    ws_url = args.ws_url or urllib.parse.urlunparse(
        (
            "ws",
            parsed_base_url.netloc,
            "/ws",
            "",
            "",
            "",
        )
    )

    token = generate_token(args.subject)
    client = HttpClient(args.base_url, args.origin, token)

    print("[1/15] 서버 health 확인")
    _, _, health = client.request(
        "GET",
        "/actuator/health",
        authenticated=False,
    )
    if not isinstance(health, dict) or health.get("status") != "UP":
        raise AssertionError(f"서버 health가 UP이 아닙니다: {health}")

    print("[2/15] credential CORS preflight 확인")
    assert_cors(client)

    print("[3/15] WebSocket 최초·재연결 인증 실패 ERROR 계약 확인")
    assert_websocket_authentication_reconnect_contract(
        ws_url,
        args.origin,
        client.cookie,
    )

    print("[4/15] HttpOnly 쿠키 JWT로 내 방·참여 가능한 공개 방 목록 확인")
    client.request("GET", "/api/v1/me/rooms")
    client.request(
        "GET",
        "/api/v1/rooms?"
        + urllib.parse.urlencode({"joinPolicy": "OPEN"}),
    )

    print("[5/15] description/categories 포함 LISTED/OPEN 방 생성")
    room_name = f"frontend-smoke-{uuid.uuid4().hex[:8]}"
    room_description = "frontend local smoke description"
    _, _, create_result = client.request(
        "POST",
        "/api/v1/rooms",
        body={
            "name": room_name,
            "description": room_description,
            "categories": ["POLICY"],
            "visibility": "LISTED",
            "joinPolicy": "OPEN",
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
        expected_statuses=(201,),
    )
    if not isinstance(create_result, dict):
        raise AssertionError("방 생성 응답이 JSON 객체가 아닙니다.")
    room_id = create_result["roomId"]

    print("[6/15] 방 상세·검색/필터 공개 목록 settings 반영 확인")
    _, _, room_detail = client.request("GET", f"/api/v1/rooms/{room_id}")
    if (
        not isinstance(room_detail, dict)
        or room_detail.get("name") != room_name
        or room_detail.get("description") != room_description
        or room_detail.get("categories") != ["POLICY"]
    ):
        raise AssertionError("방 상세 응답의 settings가 생성 요청과 다릅니다.")
    my_membership = room_detail.get("myMembership")
    self_membership_id = (
        my_membership.get("membershipId")
        if isinstance(my_membership, dict)
        else None
    )
    if not isinstance(self_membership_id, str) or not self_membership_id:
        raise AssertionError("방 상세 응답에 membershipId가 없습니다.")
    listed_room = find_public_room(
        client,
        room_id,
        query_parameters={
            "query": room_name.upper(),
            "category": "POLICY",
            "joinPolicy": "OPEN",
        },
    )
    if (
        listed_room is None
        or listed_room.get("name") != room_name
        or listed_room.get("description") != room_description
        or listed_room.get("categories") != ["POLICY"]
        or listed_room.get("joinPolicy") != "OPEN"
        or listed_room.get("visibility") != "LISTED"
    ):
        raise AssertionError(
            "생성한 Room이 query/category/joinPolicy 검색 결과와 다릅니다."
        )

    print(
        "[7/15] 구독 유지 상태에서 Room settings update/event/replay/no-op 확인"
    )
    (
        client_message_id,
        message_id,
        room_sequence,
        next_client_message_id,
        next_sequence,
    ) = run_websocket_flow(
        ws_url,
        args.origin,
        client.cookie,
        client,
        room_id,
        args.subject,
        self_membership_id,
    )

    print("[8/15] settings detail, 공개 목록 제외, INVITE_ONLY 확인")
    _, _, updated_detail = client.request(
        "GET",
        f"/api/v1/rooms/{room_id}",
    )
    if (
        updated_detail.get("visibility") != "UNLISTED"
        or updated_detail.get("joinPolicy") != "INVITE_ONLY"
        or updated_detail.get("categories") != ["ENVIRONMENT"]
        or updated_detail.get("description")
        != "frontend local smoke updated description"
    ):
        raise AssertionError(f"최신 Room settings snapshot이 다릅니다: {updated_detail}")
    if find_public_room(client, room_id) is not None:
        raise AssertionError("UNLISTED 방이 공개 방 목록에 남아 있습니다.")
    join_client = HttpClient(
        args.base_url,
        args.origin,
        generate_token(f"{args.subject}-joiner"),
    )
    _, _, join_rejection = join_client.request(
        "POST",
        f"/api/v1/rooms/{room_id}/commands/join",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        expected_statuses=(409,),
    )
    if (
        not isinstance(join_rejection, dict)
        or join_rejection.get("code") != "JOIN_POLICY_NOT_OPEN"
    ):
        raise AssertionError(
            f"INVITE_ONLY join 거절이 올바르지 않습니다: {join_rejection}"
        )

    print("[9/15] CREATE/UPDATE/DELETE event와 result 확인")
    if room_sequence < 1:
        raise AssertionError("roomSequence는 1 이상이어야 합니다.")

    print("[10/15] REST 메시지 tombstone 재동기화 확인")
    _, _, history = client.request(
        "GET",
        f"/api/v1/rooms/{room_id}/messages?afterSequence=0&limit=100",
    )
    matching_messages = [
        item
        for item in history.get("items", [])
        if item.get("clientMessageId") == client_message_id
    ]
    if len(matching_messages) != 1:
        raise AssertionError("WebSocket으로 보낸 메시지를 REST 이력에서 찾지 못했습니다.")
    tombstone = matching_messages[0]
    if "senderUserId" in tombstone:
        raise AssertionError("메시지 이력에 senderUserId가 노출됐습니다.")
    if tombstone.get("senderMembershipId") != self_membership_id:
        raise AssertionError(
            "메시지 이력 senderMembershipId가 현재 Membership과 다릅니다."
        )
    if (
        tombstone.get("messageId") != message_id
        or tombstone.get("roomSequence") != room_sequence
        or tombstone.get("messageVersion") != 3
        or tombstone.get("state") != "DELETED_BY_AUTHOR"
        or tombstone.get("countable") is not True
        or tombstone.get("content") is not None
    ):
        raise AssertionError(f"REST tombstone이 올바르지 않습니다: {tombstone}")

    print("[11/15] 수정·삭제 roomSequence 불변 확인")
    if next_sequence != room_sequence + 1:
        raise AssertionError("후속 메시지 sequence가 정확히 1 증가하지 않았습니다.")

    print("[12/15] 후속 CREATE REST snapshot 확인")
    next_messages = [
        item
        for item in history.get("items", [])
        if item.get("clientMessageId") == next_client_message_id
    ]
    if len(next_messages) != 1 or next_messages[0].get("roomSequence") != next_sequence:
        raise AssertionError("후속 메시지를 REST 이력에서 찾지 못했습니다.")

    print("[13/15] LISTED/OPEN 복원과 공개 목록 재반영 확인")
    client.request(
        "POST",
        f"/api/v1/rooms/{room_id}/commands/update-settings",
        body={
            "visibility": "LISTED",
            "joinPolicy": "OPEN",
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    if find_public_room(client, room_id) is None:
        raise AssertionError("LISTED로 복원한 방이 공개 목록에 없습니다.")

    print("[14/15] 두 번째 사용자 Room join 확인")
    inbox_member = HttpClient(
        args.base_url,
        args.origin,
        generate_token(f"{args.subject}-inbox-member"),
    )
    inbox_member.request(
        "POST",
        f"/api/v1/rooms/{room_id}/commands/join",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        expected_statuses=(201,),
    )

    print("[15/15] unread/read-state와 개인 CREATE/DELETE event 확인")
    run_room_inbox_flow(
        ws_url,
        args.origin,
        client,
        inbox_member,
        room_id,
    )

    print(
        "PASS: 쿠키 인증 → CORS → WebSocket 인증 실패/재연결 계약 → "
        "방 생성/설정 변경/목록·join 정책 → "
        "WebSocket/STOMP 구독 준비 → 생성/수정/삭제 → REST tombstone → "
        "Room inbox unread/read-state/개인 invalidation 흐름이 정상입니다."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError, RuntimeError, TimeoutError, ValueError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
