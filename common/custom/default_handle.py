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

"""Pluggable-handler mechanism: BaseHandler contract and the HandlerRegistry.

This module holds the *mechanism* only. Business implementations live outside
``common/``: the file-mode defaults and the database-backed handlers are
registered by ``orchestrate/handlers/__init__.py``; third parties can register
additional overrides the same way (:meth:`HandlerRegistry.register`).
"""

from abc import ABC, abstractmethod
from typing import Dict, Type

from loguru import logger

from common.custom.interface_type import InterfaceType
from common.util.persistence_mode import is_db_mode, persistence_mode


class BaseHandler(ABC):
    """Abstract base class requiring subclasses to implement the handle method."""

    @abstractmethod
    def handle(self, *args, **kwargs):
        """Concrete business logic is implemented by subclasses."""
        pass


class HandlerRegistry:
    """Dispatch table from an :class:`InterfaceType` to a handler class.

    Two slots exist per interface type:

    - *defaults* (file mode): the JSON-storage implementations, registered
      with :meth:`register_default`;
    - *overrides* (database mode): implementations registered with
      :meth:`register`, which replace the defaults whenever
      ``persistence_mode`` selects a database-backed mode.

    Dispatch intentionally fails loudly in database mode when no override is
    registered: silently falling back to file storage would scatter workflow
    data across two backends.
    """

    _defaults: Dict[str, Type[BaseHandler]] = {}
    _overrides: Dict[str, Type[BaseHandler]] = {}

    @classmethod
    def register_default(cls, interface_type: InterfaceType, handler_class: Type[BaseHandler]) -> None:
        """Register the file-mode implementation for an interface type."""
        cls._register_into(cls._defaults, interface_type, handler_class, slot="default")

    @classmethod
    def register(cls, interface_type: InterfaceType, handler_class: Type[BaseHandler]) -> None:
        """
        Register a database-mode (or third-party) implementation class.

        :param interface_type: Interface type identifier, e.g. ``SAVE_PSOP``
        :param handler_class: Custom class inheriting from BaseHandler
        """
        cls._register_into(cls._overrides, interface_type, handler_class, slot="override")

    @classmethod
    def _register_into(cls, slot_map: Dict[str, Type[BaseHandler]], interface_type: InterfaceType,
                       handler_class: Type[BaseHandler], slot: str) -> None:
        if not issubclass(handler_class, BaseHandler):
            raise TypeError("handler_class must be a subclass of BaseHandler")
        slot_map[interface_type.value] = handler_class

    @classmethod
    def get_handler(cls, interface_type: InterfaceType) -> BaseHandler:
        """Instantiate the handler matching the configured persistence mode."""
        if is_db_mode():
            handler_class = cls._overrides.get(interface_type.value)
            if handler_class is None:
                raise ValueError(
                    f"No custom handler registered for '{interface_type.value}' "
                    f"but persistence_mode={persistence_mode()}. "
                    "Register a handler via HandlerRegistry.register() first."
                )
            logger.debug(f"[Registry] Dispatching '{interface_type.value}' → DB handler (mode={persistence_mode()})")
            return handler_class()
        handler_class = cls._defaults.get(interface_type.value)
        if handler_class is None:
            raise ValueError(f"Unknown interface type: {interface_type}")
        logger.debug(f"[Registry] Dispatching '{interface_type.value}' → file handler (mode={persistence_mode()})")
        return handler_class()
