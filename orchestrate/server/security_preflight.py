# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.

"""Fail-closed startup check for the shipped server configuration.

Implements the contract in ``docs/design/security-design.md`` section 6.3.

The external API (``/api/v1/*``) has no application-layer guard: ``auth_middleware``
covers ``/rest/v1/orchestrate`` and the legacy ``/psops`` alias only, so those routes
are protected by mTLS and nothing else -- and mTLS only exists while
``enable_https=true``. The image defaults (``ORCH_IP=0.0.0.0`` with
``ORCH_ENABLE_HTTPS=false``, see Dockerfile and docker-compose.yml) are exactly the
combination that leaves them open to anyone who can reach the port. This check turns
that combination into a startup failure instead of a silent default.
"""

import ipaddress
import os
from dataclasses import dataclass
from typing import Tuple

from loguru import logger

# Config key allowing a credential-less bind. Lowercased by get_conf().
DEV_INSECURE_MODE_KEY = "security.dev_insecure_mode"

# First-boot credential sources named by section 5.3 of the design document.
ADMIN_INITIAL_PASSWORD_FILE_KEY = "admin_initial_password_file"
ADMIN_INITIAL_PASSWORD_ENV = "OC_ADMIN_INITIAL_PASSWORD"

PLAINTEXT_WARNING = (
    "enable_https=false: the external API (/api/v1/*) and the login request are served "
    "over plaintext. A credential is configured, so access is authenticated, but the "
    "password and the session token are readable on the wire."
)

DEV_INSECURE_WARNING = (
    "security.dev_insecure_mode=true: starting with no authentication configured on a "
    "loopback bind. Authentication is DISABLED for every route. This is for local "
    "demos only -- set access_password to run this instance normally."
)


class SecurityPreflightError(RuntimeError):
    """Raised when the deployment would start with no authentication at all."""


@dataclass(frozen=True)
class PreflightResult:
    """What the check decided, so the caller can log and audit it."""

    https_enabled: bool
    credential_configured: bool
    loopback_bind: bool
    dev_insecure_mode: bool
    warnings: Tuple[str, ...] = ()


def is_loopback_bind(bind_address: str) -> bool:
    """Whether ``bind_address`` can receive traffic from outside this host.

    ``0.0.0.0`` and ``::`` are *not* loopback: binding them is the case this check
    exists for. Hostnames are not resolved -- a startup check must not depend on DNS,
    so anything that is not literally a loopback address counts as exposed.
    """
    candidate = (bind_address or "").strip()
    if candidate.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(candidate).is_loopback
    except ValueError:
        return False


def credential_configured(conf: dict) -> bool:
    """Whether the deployment has named an application-layer credential source.

    An empty ``access_password`` means "authentication unconfigured", not
    "authentication disabled" (section 5.3), so it does not count here. Neither does
    the compiled-in default admin: the question is what the deployer configured, not
    what the process would create for itself.
    """
    if str(conf.get("access_password", "")).strip():
        return True

    initial_password_file = str(conf.get(ADMIN_INITIAL_PASSWORD_FILE_KEY, "")).strip()
    if initial_password_file and os.path.isfile(initial_password_file):
        return True

    if os.environ.get(ADMIN_INITIAL_PASSWORD_ENV, "").strip():
        return True

    return _user_store_populated(conf)


def _user_store_populated(conf: dict) -> bool:
    """True when database mode already holds a user to authenticate with."""
    try:
        from common.util.persistence_mode import is_db_mode

        if not is_db_mode(conf):
            return False

        from database.utils.user_store import has_any_user

        return bool(has_any_user())
    except Exception as e:  # noqa: BLE001 - any failure means "not configured"
        logger.warning(f"[Preflight] Could not read the user store: {e}")
        return False


def dev_insecure_mode_enabled(conf: dict) -> bool:
    """Whether the credential-less loopback exception is opted into."""
    return str(conf.get(DEV_INSECURE_MODE_KEY, "false")).strip().lower() == "true"


def security_preflight(conf: dict) -> PreflightResult:
    """Evaluate the deployment against the section 6.3 matrix.

    Raises:
        SecurityPreflightError: the server must not bind in this configuration.
    """
    https_enabled = str(conf.get("enable_https", True)).strip().lower() == "true"
    bind_address = str(conf.get("ip", "127.0.0.1"))
    loopback = is_loopback_bind(bind_address)
    credential = credential_configured(conf)
    dev_mode = dev_insecure_mode_enabled(conf)

    if https_enabled:
        # Rows 1-2: TLS is the transport guard; which routes additionally need a
        # principal is a per-route decision, not this check's.
        return PreflightResult(True, credential, loopback, dev_mode)

    if credential:
        # Row 3: authenticated, but the transport is plaintext.
        return PreflightResult(False, True, loopback, dev_mode, (PLAINTEXT_WARNING,))

    if dev_mode and loopback:
        # Row 4: the one cell the dev flag unlocks.
        return PreflightResult(False, False, True, True, (DEV_INSECURE_WARNING,))

    # Row 5, and the dev flag is not an exception to it: off-loopback, the exposure
    # is real regardless of who set the flag.
    raise SecurityPreflightError(_refusal_message(bind_address, dev_mode))


def _refusal_message(bind_address: str, dev_mode: bool) -> str:
    lines = [
        f"Refusing to start: the external API (/api/v1/*) would be reachable without "
        f"authentication (enable_https=false, no credential configured, ip={bind_address}).",
        "",
        "auth_middleware guards /rest/v1/orchestrate and /psops only, so with HTTPS off "
        "those routes have neither mTLS nor an application-layer check.",
        "",
        "Two ways to fix it:",
        "  1. configure a credential: set access_password in etc/conf/server.conf (generate "
        "one with 'python generate_access_password.py'), or name a first-boot source with "
        f"admin_initial_password_file, or export {ADMIN_INITIAL_PASSWORD_ENV};",
        "  2. bind a loopback address (ip=127.0.0.1) if this instance is only reachable locally.",
    ]
    if dev_mode:
        lines += [
            "",
            f"{DEV_INSECURE_MODE_KEY}=true is set, but it does not lift this: the flag only "
            "covers a loopback bind, where the exposure does not exist.",
        ]
    return "\n".join(lines)
