#!/bin/bash
# =============================================================================
# OpenAN Platform - Standalone Deployment Script
# =============================================================================
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# One-click deployment for single VM using Docker Compose
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Step 1: Check prerequisites
# =============================================================================
log_info "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi
log_info "Docker: $(docker --version)"

# Check Docker Compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    log_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
log_info "Docker Compose: $($COMPOSE_CMD version)"

# =============================================================================
# Step 2: Setup .env file
# =============================================================================
if [ ! -f .env ]; then
    log_info "Creating .env file from .env.example..."
    cp .env.example .env
    log_warn "Please edit .env file to configure LLM API keys before starting services."
    log_warn "Run: vim .env"
    echo ""
    read -p "Press Enter to continue after editing .env, or Ctrl+C to cancel..."
else
    log_info ".env file exists, using existing configuration"
fi

# =============================================================================
# Step 3: Check source directories
# =============================================================================
log_info "Checking source directories..."

REGISTRY_SRC="${REGISTRY_SRC:-../../registry-center}"
ORCHESTRATION_SRC="${ORCHESTRATION_SRC:-..}"

if [ ! -d "$REGISTRY_SRC" ]; then
    log_error "Registry Center source not found at: $REGISTRY_SRC"
    log_error "Please set REGISTRY_SRC environment variable or place registry-center in the expected location"
    exit 1
fi
log_info "Registry Center source: $REGISTRY_SRC"

if [ ! -d "$ORCHESTRATION_SRC" ]; then
    log_error "Orchestration Center source not found at: $ORCHESTRATION_SRC"
    log_error "Please set ORCHESTRATION_SRC environment variable or place orchestration-center in the expected location"
    exit 1
fi
log_info "Orchestration Center source: $ORCHESTRATION_SRC"

# =============================================================================
# Step 4: Build images
# =============================================================================
log_info "Building Docker images..."
$COMPOSE_CMD build

# =============================================================================
# Step 5: Start services
# =============================================================================
log_info "Starting services..."
$COMPOSE_CMD up -d

# =============================================================================
# Step 6: Wait for services to be ready
# =============================================================================
log_info "Waiting for services to be ready..."

wait_for_service() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            log_info "$service is ready"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo ""
    log_error "$service failed to start within $((max_attempts * 2)) seconds"
    return 1
}

# Wait for PostgreSQL
log_info "Waiting for PostgreSQL..."
wait_for_service "PostgreSQL" "postgres" || true

# Wait for Registry Center
log_info "Waiting for Registry Center..."
wait_for_service "Registry Center" "http://localhost:5000/rest/v1/registry-center/agent-cards" || true

# Wait for Orchestration Center
log_info "Waiting for Orchestration Center..."
wait_for_service "Orchestration Center" "http://localhost:5001/rest/v1/orchestrate/agent-cards" || true

# =============================================================================
# Step 7: Show status
# =============================================================================
echo ""
log_info "=========================================="
log_info "OpenAN Platform Deployment Complete!"
log_info "=========================================="
echo ""
echo "Services:"
echo "  - PostgreSQL:          localhost:5432"
echo "  - Registry Center:     http://localhost:5000"
echo "  - Orchestration Center: http://localhost:5001"
echo ""
echo "Useful commands:"
echo "  - View logs:    $COMPOSE_CMD logs -f"
echo "  - Stop:         $COMPOSE_CMD down"
echo "  - Restart:      $COMPOSE_CMD restart"
echo "  - Status:       $COMPOSE_CMD ps"
echo ""
