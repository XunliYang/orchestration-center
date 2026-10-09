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

"""SQL backends (PostgreSQL and MySQL) behind the storage ports.

P1 keeps this adapter as a thin delegation to the existing
``orchestrate.handlers.*_processor`` functions and to
``database.utils.user_store``: the point of this phase is to move *who calls
what*, not to change any SQL. P2 replaces the delegation with a shared
dialect-aware SQL layer and adds versioned migrations.

Both SQL brands share this class because the current code is already
brand-agnostic at this level -- the brand-specific knowledge lives in
``database.utils.sql_dialect`` and the two connection modules.
"""

from typing import Any, Dict, List, Optional

from loguru import logger

from orchestrate.core.model.execution_record import ExecutionRecord
from orchestrate.core.model.preflow import PreFlow
from orchestrate.core.model.psop import PSOP
from orchestrate.core.workflow_search_result import WorkflowSearchResult
from orchestrate.handlers import execution_record_processor as execution_records
from orchestrate.handlers import psop_processor as psops
from orchestrate.persistence.file_backend import FilePreflowRepository
from orchestrate.persistence.contracts import (
    Capability,
    ExecutionRecordRepository,
    PersistenceBackend,
    PreflowRepository,
    PsopRepository,
    UserRepository,
)
from orchestrate.persistence.errors import StorageUnavailableError
from orchestrate.workflow_storage_instance import get_workflow_storage


class _SqlPsopRepository(PsopRepository):
    def save(self, psop: PSOP) -> str:
        return psops.custom_save_psop(psop)

    def get(self, psop_id: str) -> Optional[PSOP]:
        return psops.get_psop_by_id(psop_id)

    def list_summaries(self) -> List[WorkflowSearchResult]:
        return psops.get_all_psops()

    def delete(self, psop_id: str) -> bool:
        return psops.custom_delete_psop(psop_id)


class _SqlExecutionRecordRepository(ExecutionRecordRepository):
    def save(self, record: ExecutionRecord) -> str:
        return execution_records.db_save_execution_record(record)

    def list_summaries(self) -> List[Dict[str, Any]]:
        return execution_records.db_list_execution_records()

    def get(self, execution_id: str) -> Optional[ExecutionRecord]:
        return execution_records.db_get_execution_record(execution_id)

    def delete(self, execution_id: str) -> bool:
        return execution_records.db_delete_execution_record(execution_id)


class _SqlUserRepository(UserRepository):
    """Delegates to ``database.utils.user_store`` (moved into the SQL layer in P2)."""

    def has_any(self) -> bool:
        from database.utils.user_store import has_any_user

        return has_any_user()

    def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        from database.utils.user_store import authenticate_user

        return authenticate_user(username, password)

    def create(self, username: str, password: str, role: str, must_change_password: bool) -> bool:
        from database.utils.user_store import create_user

        return create_user(username, password, role=role, must_change_password=must_change_password)

    def list_accounts(self) -> List[Dict[str, Any]]:
        from database.utils.user_store import list_users

        return list_users()

    def delete(self, username: str) -> bool:
        from database.utils.user_store import delete_user

        return delete_user(username)

    def update_password(self, username: str, new_password: str) -> bool:
        from database.utils.user_store import update_password

        return update_password(username, new_password)


class SqlPersistenceBackend(PersistenceBackend):
    """``persistence_mode=postgresql`` or ``mysql``; brand details live below this line."""

    capabilities = frozenset({Capability.USERS})

    def __init__(self, mode: str, conf: Optional[dict] = None, storage=None) -> None:
        self.mode = mode
        self._conf = conf or {}
        # PreFlows stay file-backed in both database modes (see AGENTS.md);
        # injectable for the same reason as in the file backend.
        if storage is None:
            storage = get_workflow_storage()
        self._psops = _SqlPsopRepository()
        self._executions = _SqlExecutionRecordRepository()
        self._users = _SqlUserRepository()
        self._preflows = FilePreflowRepository(storage)

    def check_ready(self) -> None:
        """Open one connection so a dead database fails at startup, not at request time."""
        from database.utils.db_connection import create_connection

        conn = create_connection()
        if conn is None:
            raise StorageUnavailableError(
                f"'{self.mode}' persistence is configured but the database is not reachable"
            )
        try:
            conn.close()
        except Exception:  # pragma: no cover - defensive, closing must not mask readiness
            logger.warning("[Storage] Failed to close the readiness connection", exc_info=True)

    def initialize(self) -> None:
        """Create the schema, idempotently (today: ``table_creation.create_tables``)."""
        from database.utils.table_creation import create_tables

        create_tables()

    def psops(self) -> PsopRepository:
        return self._psops

    def executions(self) -> ExecutionRecordRepository:
        return self._executions

    def preflows(self) -> PreflowRepository:
        return self._preflows

    def users(self) -> UserRepository:
        return self._users

    def close(self) -> None:
        """Release the MySQL pool; PostgreSQL closes per operation."""
        from database.utils.db_connection import close_database

        close_database()
