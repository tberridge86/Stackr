from __future__ import annotations

import base64
import hashlib
import hmac
import re
import threading
import time
from dataclasses import dataclass
from typing import Mapping
from uuid import UUID

from .settings import Settings


NONCE_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{16,128}$")
DEVICE_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


class ServiceAuthenticationError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


@dataclass(frozen=True)
class GatewayActor:
    service_id: str
    user_id: str
    device_id: str


class ReplayGuard:
    def __init__(self):
        self._nonces: dict[str, float] = {}
        self._lock = threading.Lock()

    def accept(self, nonce: str, expires_at: float) -> bool:
        now = time.time()
        with self._lock:
            self._nonces = {key: expiry for key, expiry in self._nonces.items() if expiry > now}
            if nonce in self._nonces:
                return False
            self._nonces[nonce] = expires_at
            return True


def body_sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def signature_input(
    *,
    service_id: str,
    timestamp: str,
    nonce: str,
    method: str,
    path: str,
    body_hash: str,
    user_id: str,
    device_id: str,
) -> str:
    return "\n".join([
        service_id,
        timestamp,
        nonce,
        method.upper(),
        path,
        body_hash,
        user_id,
        device_id,
    ])


def sign_service_request(
    secret: str,
    *,
    service_id: str,
    timestamp: str,
    nonce: str,
    method: str,
    path: str,
    body: bytes,
    user_id: str,
    device_id: str,
) -> dict[str, str]:
    digest = body_sha256(body)
    canonical = signature_input(
        service_id=service_id,
        timestamp=timestamp,
        nonce=nonce,
        method=method,
        path=path,
        body_hash=digest,
        user_id=user_id,
        device_id=device_id,
    )
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")
    return {
        "x-stackr-service-id": service_id,
        "x-stackr-service-timestamp": timestamp,
        "x-stackr-service-nonce": nonce,
        "x-stackr-service-signature": signature,
        "x-stackr-body-sha256": digest,
        "x-stackr-user-id": user_id,
        "x-stackr-device-id": device_id,
    }


class GatewayServiceAuthenticator:
    def __init__(self, settings: Settings, replay_guard: ReplayGuard | None = None):
        self.mode = settings.gateway_auth_mode
        self.service_id = settings.gateway_service_id
        self.secret = settings.gateway_service_secret_value
        self.max_age_seconds = settings.gateway_signature_max_age_seconds
        self.replay_guard = replay_guard or ReplayGuard()

    def verify(self, headers: Mapping[str, str], method: str, path: str, body: bytes) -> GatewayActor | None:
        if self.mode == "disabled":
            return None
        if not self.secret:
            raise ServiceAuthenticationError(
                503,
                "gateway_auth_unconfigured",
                "Recognition gateway authentication is not configured.",
            )

        service_id = str(headers.get("x-stackr-service-id", "")).strip()
        timestamp = str(headers.get("x-stackr-service-timestamp", "")).strip()
        nonce = str(headers.get("x-stackr-service-nonce", "")).strip()
        supplied_signature = str(headers.get("x-stackr-service-signature", "")).strip()
        supplied_body_hash = str(headers.get("x-stackr-body-sha256", "")).strip().lower()
        user_id = str(headers.get("x-stackr-user-id", "")).strip()
        device_id = str(headers.get("x-stackr-device-id", "")).strip()

        if service_id != self.service_id:
            raise ServiceAuthenticationError(401, "service_auth_invalid", "Recognition service credential is invalid.")
        if not timestamp.isdigit() or not NONCE_PATTERN.fullmatch(nonce) or not supplied_signature:
            raise ServiceAuthenticationError(401, "service_auth_invalid", "Recognition service credential is invalid.")
        try:
            UUID(user_id)
        except (ValueError, AttributeError):
            raise ServiceAuthenticationError(401, "service_actor_invalid", "Recognition service actor is invalid.") from None
        if not DEVICE_PATTERN.fullmatch(device_id):
            raise ServiceAuthenticationError(401, "service_actor_invalid", "Recognition service actor is invalid.")

        request_time = int(timestamp)
        now = int(time.time())
        if request_time > now + 10 or now - request_time > self.max_age_seconds:
            raise ServiceAuthenticationError(401, "service_signature_expired", "Recognition service signature has expired.")

        actual_body_hash = body_sha256(body)
        if not hmac.compare_digest(actual_body_hash, supplied_body_hash):
            raise ServiceAuthenticationError(401, "service_body_mismatch", "Recognition request body signature is invalid.")

        canonical = signature_input(
            service_id=service_id,
            timestamp=timestamp,
            nonce=nonce,
            method=method,
            path=path,
            body_hash=actual_body_hash,
            user_id=user_id,
            device_id=device_id,
        )
        expected = base64.urlsafe_b64encode(
            hmac.new(self.secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).digest()
        ).decode("ascii").rstrip("=")
        if not hmac.compare_digest(expected, supplied_signature):
            raise ServiceAuthenticationError(401, "service_auth_invalid", "Recognition service credential is invalid.")
        if not self.replay_guard.accept(nonce, request_time + self.max_age_seconds):
            raise ServiceAuthenticationError(409, "service_replay_detected", "Recognition service request was already used.")

        return GatewayActor(service_id=service_id, user_id=user_id, device_id=device_id)
