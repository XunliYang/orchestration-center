#!/bin/bash
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
set -e

APP_HOME="${APP_HOME:-/opt/orchestration-center}"
cd "$APP_HOME"

export PATH="/opt/venv/bin:$PATH"

# ─────────────────────────────────────────────────────────────────────
# Cloud Run / Kubernetes environment variable → config file override
# The application reads model definitions and other settings from config
# files. This bridge writes env var values into those files so they take
# effect at runtime. Secrets are the exception: they stay in the environment
# and are referenced from the generated models.yaml instead of being written.
# ─────────────────────────────────────────────────────────────────────

SERVER_CONF="etc/conf/server.conf"
MODELS_CONF="etc/config/models.yaml"
A2AT_ENV=".env"

# --- server.conf overrides (using # as sed delimiter to handle paths safely) ---
if [ -n "${ORCH_IP}" ]; then
    sed -i "s#^ip=.*#ip=${ORCH_IP}#" "${SERVER_CONF}"
    echo "Config override: ip=${ORCH_IP}"
fi

# Cloud Run injects PORT env var
if [ -n "${PORT}" ]; then
    sed -i "s#^port=.*#port=${PORT}#" "${SERVER_CONF}"
    echo "Config override: port=${PORT} (Cloud Run)"
elif [ -n "${ORCH_PORT}" ]; then
    sed -i "s#^port=.*#port=${ORCH_PORT}#" "${SERVER_CONF}"
    echo "Config override: port=${ORCH_PORT}"
fi

if [ -n "${ORCH_ENABLE_HTTPS}" ]; then
    sed -i "s#^enable_https=.*#enable_https=${ORCH_ENABLE_HTTPS}#" "${SERVER_CONF}"
    echo "Config override: enable_https=${ORCH_ENABLE_HTTPS}"
fi

if [ -n "${ORCH_FORWARDED_ALLOW_IPS}" ]; then
    sed -i "s#^forwarded_allow_ips=.*#forwarded_allow_ips=\"${ORCH_FORWARDED_ALLOW_IPS}\"#" "${SERVER_CONF}"
    echo "Config override: forwarded_allow_ips=${ORCH_FORWARDED_ALLOW_IPS}"
fi

if [ -n "${AGENT_REGISTRY_URL}" ]; then
    sed -i "s#^agent_registry_url=.*#agent_registry_url=${AGENT_REGISTRY_URL}#" "${SERVER_CONF}"
    echo "Config override: agent_registry_url=${AGENT_REGISTRY_URL}"
fi

# When HTTPS is disabled, also disable cert verification
if [ "${ORCH_ENABLE_HTTPS}" = "false" ]; then
    sed -i "s#^verify_client=.*#verify_client=false#" "${SERVER_CONF}"
    echo "Config override: HTTPS disabled -> verify_client=false"
fi

# --- Persistence selector (connections/secrets are read directly by Python) ---
if [ -n "${PERSISTENCE_MODE}" ]; then
    sed -i "s#^persistence_mode=.*#persistence_mode=${PERSISTENCE_MODE}#" "${SERVER_CONF}"
    echo "Config override: persistence_mode=${PERSISTENCE_MODE}"
fi

# Connection environment variables never get materialized into files.

# --- models.yaml generation (LLM model definitions) ---
# models.yaml is local configuration and is not shipped in the image. A platform
# that can only supply environment variables gets the chat entry built here; a
# file that already exists (for example one bind-mounted by Docker Compose) is
# left untouched. The key itself is never written: api_key_env only names the
# variable that holds it.
if [ -f "${MODELS_CONF}" ]; then
    echo "Model config: using existing ${MODELS_CONF}"
elif [ -n "${LLM_CHAT_MODEL}" ] && [ -n "${LLM_CHAT_URL}" ]; then
    case "${LLM_CHAT_PROVIDER:-openai_compatible}" in
        openai|openai_compatible) ;;
        *) echo "LLM_CHAT_PROVIDER=${LLM_CHAT_PROVIDER} cannot be generated from the simplified environment settings; provide a complete models.yaml" >&2; exit 1 ;;
    esac
    mkdir -p "$(dirname "${MODELS_CONF}")"
    python3 -c "
import os, yaml
chat = {
    'provider': 'openai_compatible',
    'model': os.environ['LLM_CHAT_MODEL'],
    'url': os.environ['LLM_CHAT_URL'],
}
if os.environ.get('LLM_CHAT_API_KEY'):
    chat['api_key_env'] = 'LLM_CHAT_API_KEY'
with open('${MODELS_CONF}', 'w') as f:
    yaml.safe_dump({'models': {'chat': chat}}, f, sort_keys=False)
"
    echo "Config override: models.yaml[chat] generated from environment variables"
elif [ -n "${LLM_CHAT_MODEL}" ] || [ -n "${LLM_CHAT_URL}" ] || [ -n "${LLM_CHAT_API_KEY}" ]; then
    echo "Incomplete chat model configuration: set both LLM_CHAT_MODEL and LLM_CHAT_URL" >&2
    exit 1
fi

# --- .env overrides (A2A-T SDK) ---
if [ -f "${A2AT_ENV}" ]; then
if [ -n "${A2AT_LLM_PROVIDER}" ]; then
    sed -i "s#^A2AT_LLM_PROVIDER=.*#A2AT_LLM_PROVIDER=${A2AT_LLM_PROVIDER}#" "${A2AT_ENV}"
    echo "Config override: A2AT_LLM_PROVIDER=${A2AT_LLM_PROVIDER}"
fi
if [ -n "${A2AT_LLM_MODEL}" ]; then
    sed -i "s#^A2AT_LLM_MODEL=.*#A2AT_LLM_MODEL=${A2AT_LLM_MODEL}#" "${A2AT_ENV}"
    echo "Config override: A2AT_LLM_MODEL=${A2AT_LLM_MODEL}"
fi
if [ -n "${A2AT_LLM_API_KEY}" ]; then
    sed -i "s#^A2AT_LLM_API_KEY=.*#A2AT_LLM_API_KEY=${A2AT_LLM_API_KEY}#" "${A2AT_ENV}"
    echo "Config override: A2AT_LLM_API_KEY=***"
fi
if [ -n "${A2AT_LLM_BASE_URL}" ]; then
    sed -i "s#^A2AT_LLM_BASE_URL=.*#A2AT_LLM_BASE_URL=${A2AT_LLM_BASE_URL}#" "${A2AT_ENV}"
    echo "Config override: A2AT_LLM_BASE_URL=${A2AT_LLM_BASE_URL}"
fi
fi

# Ensure required directories exist
mkdir -p log run data

if [ "${1}" = "serve" ]; then
    echo "Starting orchestration-center service..."
    exec python3 -m orchestrate.start
fi

exec "$@"
