"""Authentication: Studio never has an identity of its own.

Every request carries a Central session token, which we validate against
Central and then use for all downstream calls. Studio issues no credentials and
stores no passwords.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, Header, HTTPException, Request

from .central import CentralError, Client

# Short-lived cache so a burst of UI calls does not re-check the token each time.
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL = 30.0
_CACHE_MAX = 512


@dataclass
class Caller:
    token: str
    user: dict[str, Any]

    @property
    def client(self) -> Client:
        return Client(token=self.token)

    @property
    def display_name(self) -> str:
        return str(self.user.get("displayName") or self.user.get("email") or "unknown")


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return token


def _verify(token: str) -> dict[str, Any]:
    cached = _CACHE.get(token)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    try:
        user = Client(token=token).current_user()
    except CentralError as exc:
        if exc.status in (401, 403):
            raise HTTPException(status_code=401, detail="Session expired. Sign in again.")
        raise HTTPException(status_code=502, detail=f"Central is unavailable: {exc.message}")
    if len(_CACHE) > _CACHE_MAX:
        _CACHE.clear()
    _CACHE[token] = (time.monotonic() + _CACHE_TTL, user)
    return user


def forget(token: str) -> None:
    _CACHE.pop(token, None)


def require_caller(authorization: str | None = Header(default=None)) -> Caller:
    token = _bearer(authorization)
    return Caller(token=token, user=_verify(token))


def session_cookie_token(request: Request) -> str | None:
    """Read Central's own session cookie, for single-sign-on convenience."""
    for name in ("__Host-session", "session"):
        value = request.cookies.get(name)
        if value:
            return value
    return None


def require_project_access(caller: Caller, project_id: int) -> dict[str, Any]:
    """Confirm the caller can see this project; Central decides, not Studio."""
    try:
        with_client = caller.client
        projects = {p["id"]: p for p in with_client.projects()}
    except CentralError as exc:
        raise HTTPException(status_code=502, detail=f"Central is unavailable: {exc.message}")
    project = projects.get(project_id)
    if project is None:
        raise HTTPException(
            status_code=403, detail="You do not have access to that project."
        )
    return project


CallerDep = Depends(require_caller)
