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

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_orchestration_runtime_does_not_import_samples():
    violations = []
    for path in (ROOT / "orchestrate").rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "from samples" in text or "import samples" in text:
            violations.append(str(path.relative_to(ROOT)))

    assert violations == []


def test_host_agent_runtime_does_not_import_application_or_sample_packages():
    violations = []
    for path in (ROOT / "host_agent").rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        forbidden = ("from orchestrate", "import orchestrate", "from samples", "import samples", "from common", "import common")
        if any(marker in text for marker in forbidden):
            violations.append(str(path.relative_to(ROOT)))

    assert violations == []


def test_host_agent_runtime_contains_no_demo_credentials():
    text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "host_agent").rglob("*.py")
        if "__pycache__" not in path.parts
    )

    assert "Admin@123" not in text
