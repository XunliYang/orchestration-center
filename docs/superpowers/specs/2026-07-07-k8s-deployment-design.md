# K8S Cluster Deployment Design

## Overview

Design Kubernetes deployment manifests for the orchestration-center, targeting generic Kubernetes clusters (not cloud-specific). Reuses the existing Dockerfile and docker-entrypoint.sh without modification.

**Goals:**
- One-command deploy: `kubectl apply -f k8s/`
- Support both internal PostgreSQL (StatefulSet) and external database
- Production-ready: HPA, health checks, resource limits, Nginx Ingress
- Sensitive data in K8S Secrets, non-sensitive config in ConfigMap

**Non-goals:**
- Multi-cloud abstraction (no Helm/Kustomize)
- CI/CD pipeline integration
- Multi-region / multi-cluster deployment

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │           orchestration-center NS            │
                    │                                             │
  Internet ──► Ingress ──► Service ──► Deployment (2~10 pods)    │
                    │              │                               │
                    │              ├── ConfigMap (env vars)        │
                    │              └── Secret (passwords/keys)     │
                    │                                             │
                    │  ┌──────────────────────┐                   │
                    │  │ PostgreSQL StatefulSet│ (optional)        │
                    │  │ + PVC 10Gi            │                   │
                    │  └──────────────────────┘                   │
                    └─────────────────────────────────────────────┘
                              │
                              ▼
                    External: LLM API, Agent Registry
```

## File Structure

```
k8s/
├── namespace.yaml              # Namespace definition
├── secret.yaml                 # Sensitive data (DB password, LLM API key)
├── configmap.yaml              # Non-sensitive config (env var overrides)
├── postgres-statefulset.yaml   # PostgreSQL StatefulSet + Headless Service + PVC
├── deployment.yaml             # orchestration-center Deployment
├── service.yaml                # ClusterIP Service
├── ingress.yaml                # Nginx Ingress
└── hpa.yaml                    # HPA autoscaling
```

**Deploy order (kubectl apply handles dependencies):**
```
namespace → secret/configmap → postgres → deployment → service → ingress → hpa
```

## Component Design

### 1. Namespace

- Name: `orchestration-center`
- Label: `app: orchestration-center`

### 2. Secret

| Key | Purpose | Env Var Name | Encoding |
|---|---|---|---|
| `db-password` | PostgreSQL password | `DB_PASSWORD` | base64 |
| `llm-api-key` | LLM API key (chat) | `LLM_CHAT_API_KEY` | base64 |
| `a2at-llm-api-key` | LLM API key (A2AT SDK) | `A2AT_LLM_API_KEY` | base64 |

File header includes comment: `echo -n "value" | base64` for generating encoded values.

Secret values require explicit `env` entries with `secretKeyRef` (key name differs from env var name).

### 3. ConfigMap

Maps to environment variables consumed by `docker-entrypoint.sh`:

| Key | Env Var | Default |
|---|---|---|
| `ORCH_IP` | `ORCH_IP` | `0.0.0.0` |
| `ORCH_PORT` | `ORCH_PORT` | `5001` |
| `ORCH_ENABLE_HTTPS` | `ORCH_ENABLE_HTTPS` | `false` |
| `ORCH_FORWARDED_ALLOW_IPS` | `ORCH_FORWARDED_ALLOW_IPS` | `*` |
| `PERSISTENCE_MODE` | `PERSISTENCE_MODE` | `postgresql` |
| `DB_HOST` | `DB_HOST` | `orchestration-postgres` |
| `DB_PORT` | `DB_PORT` | `5432` |
| `DB_NAME` | `DB_NAME` | `orchestration_center` |
| `DB_USERNAME` | `DB_USERNAME` | `opena2a_t` |
| `AGENT_REGISTRY_URL` | `AGENT_REGISTRY_URL` | (empty, user fills in) |
| `LLM_CHAT_MODEL` | `LLM_CHAT_MODEL` | `deepseek-chat` |
| `LLM_CHAT_URL` | `LLM_CHAT_URL` | `https://api.deepseek.com/v1/chat/completions` |
| `A2AT_LLM_PROVIDER` | `A2AT_LLM_PROVIDER` | `deepseek` |
| `A2AT_LLM_MODEL` | `A2AT_LLM_MODEL` | `deepseek-chat` |
| `A2AT_LLM_BASE_URL` | `A2AT_LLM_BASE_URL` | `https://api.deepseek.com` |

**Bridge mechanism:** `docker-entrypoint.sh` already converts these env vars into `server.conf`, `db_config.json`, `llm_config.json`, and `.env` at container startup. No image changes needed.

### 4. PostgreSQL StatefulSet

File: `postgres-statefulset.yaml` (contains 3 resources)

| Resource | Name | Notes |
|---|---|---|
| StatefulSet | `orchestration-postgres` | 1 replica, postgres:15-alpine |
| Service (headless) | `orchestration-postgres` | `clusterIP: None`, stable DNS |
| PVC (template) | `postgres-data` | 10Gi, ReadWriteOnce |

| Setting | Value |
|---|---|
| Image | `postgres:15-alpine` |
| Password | `secretKeyRef: db-password` |
| Port | 5432 |
| Data dir | `/var/lib/postgresql/data` (PVC mount) |
| Resources | requests: 256Mi/250m, limits: 512Mi/500m |
| Readiness | `pg_isready -U opena2a_t` |
| Storage | 10Gi, default StorageClass |

**External DB mode:** Skip this file (`kubectl apply -f k8s/ --prune -l app!=postgres` or just exclude the file). Update ConfigMap `DB_HOST` to external address.

### 5. Deployment

| Setting | Value |
|---|---|
| Replicas | 2 (HPA scales 2~10) |
| Image | `orchestration-center:latest` (user builds/pushes) |
| Image pull policy | `IfNotPresent` |
| Container port | 5001 |
| Env source | `configMapRef` + `secretRef` |

**Env var mapping:**

```
ConfigMap (envFrom) → ORCH_IP, DB_HOST, LLM_CHAT_URL, PERSISTENCE_MODE, etc. → docker-entrypoint.sh → config files
Secret (env+secretKeyRef) → DB_PASSWORD, LLM_CHAT_API_KEY, A2AT_LLM_API_KEY → docker-entrypoint.sh → db_config.json / llm_config.json / .env
```

**Probes (aligned with docker-compose.yml healthcheck):**

| Probe | Config |
|---|---|
| `startupProbe` | `GET /rest/v1/orchestrate/agent-cards`, failureThreshold=12, periodSeconds=10 |
| `livenessProbe` | `GET /rest/v1/orchestrate/agent-cards`, initialDelaySeconds=40, periodSeconds=30 |
| `readinessProbe` | `GET /rest/v1/orchestrate/agent-cards`, initialDelaySeconds=10, periodSeconds=10 |

**Resource limits (aligned with Cloud Run 1Gi/1cpu):**

| | requests | limits |
|---|---|---|
| CPU | 250m | 1000m |
| Memory | 512Mi | 1Gi |

### 6. Service

| Setting | Value |
|---|---|
| Type | ClusterIP |
| Port | 80 → 5001 (targetPort) |
| Selector | `app: orchestration-center` |

### 7. Ingress

| Setting | Value |
|---|---|
| Class | `nginx` |
| Path | `/` (Prefix) → orchestration-center:80 |
| Timeout annotations | `proxy-read-timeout: 300`, `proxy-send-timeout: 300` |
| Body size | `proxy-body-size: 50m` (PDF upload) |
| Host | Placeholder, user replaces before deploy |
| TLS | Commented template provided |

### 8. HPA

| Setting | Value |
|---|---|
| Target | Deployment/orchestration-center |
| Min replicas | 2 |
| Max replicas | 10 |
| CPU target | 70% utilization |
| Memory target | 80% utilization |

## Error Handling

| Scenario | Behavior |
|---|---|
| PostgreSQL not ready | Deployment `startupProbe` waits up to 120s; pod not marked ready until DB connects |
| LLM API unreachable | App logs error, PSOP generation fails gracefully, execution still works |
| Secret missing | Pod fails to start with `CreateContainerConfigError`, visible in `kubectl get pods` |
| PVC pending | Pod stays `Pending` until StorageClass provisions volume |

## Deployment Commands

```bash
# Full deploy (with internal PostgreSQL)
kubectl apply -f k8s/

# Deploy without internal PostgreSQL (using external DB)
# 1. Edit k8s/configmap.yaml: set DB_HOST to external address, PERSISTENCE_MODE to postgresql
# 2. Apply all files except postgres-statefulset.yaml:
for f in namespace secret configmap deployment service ingress hpa; do kubectl apply -f k8s/${f}.yaml; done

# Build and push image (user must do this before deploy)
docker build -t orchestration-center:latest .
docker tag orchestration-center:latest <registry>/orchestration-center:latest
docker push <registry>/orchestration-center:latest
# Then update deployment.yaml image field

# Check status
kubectl -n orchestration-center get all
kubectl -n orchestration-center logs -l app=orchestration-center -f

# Delete all
kubectl delete -f k8s/
```

## Alignment with deploy-all.ps1

| deploy-all.ps1 | K8S equivalent |
|---|---|
| Cloud Run service | Deployment + Service |
| Cloud SQL PostgreSQL | PostgreSQL StatefulSet + PVC |
| Secret Manager | K8S Secret |
| `--set-env-vars` | ConfigMap + Secret → envFrom |
| `--memory=1Gi --cpu=1` | resources.limits: 1Gi/1000m |
| `--max-instances=10` | hpa.maxReplicas: 10 |
| `--concurrency=80` | (uvicorn handles internally, not K8S concern) |
| `--timeout=300` | Ingress proxy-read-timeout: 300 |
| `--allow-unauthenticated` | Ingress without auth annotations |
| `--add-cloudsql-instances` | Internal PG or external DB_HOST |
| AGENT_REGISTRY_URL | ConfigMap |
| LLM_CHAT_* | ConfigMap + Secret |
