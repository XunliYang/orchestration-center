# K8S Deployment Manifests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create production-ready Kubernetes deployment manifests for orchestration-center, matching the existing GCP Cloud Run deployment capabilities.

**Architecture:** 8 YAML files in `k8s/` directory — Namespace, Secret, ConfigMap, PostgreSQL StatefulSet, Deployment, Service, Ingress, HPA. Reuses existing Dockerfile and docker-entrypoint.sh without modification. ConfigMap provides non-sensitive env vars via `envFrom`, Secret provides sensitive values via explicit `env` + `secretKeyRef`.

**Tech Stack:** Kubernetes 1.24+, Nginx Ingress Controller, PostgreSQL 15

**Spec:** `docs/superpowers/specs/2026-07-07-k8s-deployment-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `k8s/namespace.yaml` | Namespace isolation |
| `k8s/secret.yaml` | Sensitive data (DB password, LLM API keys) |
| `k8s/configmap.yaml` | Non-sensitive config (env vars for docker-entrypoint.sh bridge) |
| `k8s/postgres-statefulset.yaml` | PostgreSQL StatefulSet + headless Service + PVC template |
| `k8s/deployment.yaml` | orchestration-center app Deployment (2 replicas) |
| `k8s/service.yaml` | ClusterIP Service (port 80 → 5001) |
| `k8s/ingress.yaml` | Nginx Ingress with timeout annotations |
| `k8s/hpa.yaml` | HPA autoscaling (2–10 replicas, CPU 70% / Memory 80%) |

---

### Task 1: Namespace

**Files:**
- Create: `k8s/namespace.yaml`

- [ ] **Step 1: Create k8s directory**

Run:
```powershell
New-Item -ItemType Directory -Path "k8s" -Force
```

- [ ] **Step 2: Create namespace.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

apiVersion: v1
kind: Namespace
metadata:
  name: orchestration-center
  labels:
    app: orchestration-center
```

- [ ] **Step 3: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/namespace.yaml --dry-run=client
```
Expected: `namespace/orchestration-center created (dry run)`

- [ ] **Step 4: Commit**

```bash
git add k8s/namespace.yaml
git commit -m "feat(k8s): add namespace definition"
```

---

### Task 2: Secret

**Files:**
- Create: `k8s/secret.yaml`

- [ ] **Step 1: Create secret.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# BEFORE DEPLOYING: Replace placeholder values with base64-encoded secrets.
# Generate encoded values with:
#   [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("your-value"))
# Or on Linux/Mac:
#   echo -n "your-value" | base64

apiVersion: v1
kind: Secret
metadata:
  name: orchestration-center-secret
  namespace: orchestration-center
  labels:
    app: orchestration-center
type: Opaque
data:
  # PostgreSQL password → env var DB_PASSWORD
  db-password: b3BlbkEyQV9U
  # LLM API key (chat) → env var LLM_CHAT_API_KEY
  llm-api-key: c2steW91ci1hcGkta2V5
  # LLM API key (A2AT SDK) → env var A2AT_LLM_API_KEY
  a2at-llm-api-key: c2steW91ci1hcGkta2V5
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/secret.yaml --dry-run=client
```
Expected: `secret/orchestration-center-secret created (dry run)`

- [ ] **Step 3: Commit**

```bash
git add k8s/secret.yaml
git commit -m "feat(k8s): add secret for sensitive credentials"
```

---

### Task 3: ConfigMap

**Files:**
- Create: `k8s/configmap.yaml`

- [ ] **Step 1: Create configmap.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

apiVersion: v1
kind: ConfigMap
metadata:
  name: orchestration-center-config
  namespace: orchestration-center
  labels:
    app: orchestration-center
data:
  # Server
  ORCH_IP: "0.0.0.0"
  ORCH_PORT: "5001"
  ORCH_ENABLE_HTTPS: "false"
  ORCH_FORWARDED_ALLOW_IPS: "*"

  # Persistence
  PERSISTENCE_MODE: "postgresql"

  # Database (default: internal PostgreSQL service)
  DB_HOST: "orchestration-postgres"
  DB_PORT: "5432"
  DB_NAME: "orchestration_center"
  DB_USERNAME: "opena2a_t"

  # Agent Registry Center (fill in your Registry URL)
  AGENT_REGISTRY_URL: ""

  # LLM Chat (for PSOP generation and execution)
  LLM_CHAT_MODEL: "deepseek-chat"
  LLM_CHAT_URL: "https://api.deepseek.com/v1/chat/completions"

  # A2AT SDK LLM config
  A2AT_LLM_PROVIDER: "deepseek"
  A2AT_LLM_MODEL: "deepseek-chat"
  A2AT_LLM_BASE_URL: "https://api.deepseek.com"
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/configmap.yaml --dry-run=client
```
Expected: `configmap/orchestration-center-config created (dry run)`

- [ ] **Step 3: Commit**

```bash
git add k8s/configmap.yaml
git commit -m "feat(k8s): add configmap for non-sensitive configuration"
```

---

### Task 4: PostgreSQL StatefulSet

**Files:**
- Create: `k8s/postgres-statefulset.yaml`

- [ ] **Step 1: Create postgres-statefulset.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Skip this file when using an external PostgreSQL database.
# Update k8s/configmap.yaml DB_HOST to your external DB address instead.

---
apiVersion: v1
kind: Service
metadata:
  name: orchestration-postgres
  namespace: orchestration-center
  labels:
    app: orchestration-postgres
spec:
  clusterIP: None
  selector:
    app: orchestration-postgres
  ports:
  - port: 5432
    targetPort: 5432
    protocol: TCP
    name: postgres

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: orchestration-postgres
  namespace: orchestration-center
  labels:
    app: orchestration-postgres
spec:
  serviceName: orchestration-postgres
  replicas: 1
  selector:
    matchLabels:
      app: orchestration-postgres
  template:
    metadata:
      labels:
        app: orchestration-postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: "orchestration_center"
        - name: POSTGRES_USER
          value: "opena2a_t"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: orchestration-center-secret
              key: db-password
        - name: PGDATA
          value: "/var/lib/postgresql/data/pgdata"
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - opena2a_t
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - opena2a_t
          initialDelaySeconds: 15
          periodSeconds: 30
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 10Gi
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/postgres-statefulset.yaml --dry-run=client
```
Expected:
```
service/orchestration-postgres created (dry run)
statefulset.apps/orchestration-postgres created (dry run)
```

- [ ] **Step 3: Commit**

```bash
git add k8s/postgres-statefulset.yaml
git commit -m "feat(k8s): add PostgreSQL StatefulSet with PVC"
```

---

### Task 5: Deployment

**Files:**
- Create: `k8s/deployment.yaml`

- [ ] **Step 1: Create deployment.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# BEFORE DEPLOYING: Update the image field to your registry path.
# Example: your-registry.com/orchestration-center:v1.0.0

apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestration-center
  namespace: orchestration-center
  labels:
    app: orchestration-center
spec:
  replicas: 2
  selector:
    matchLabels:
      app: orchestration-center
  template:
    metadata:
      labels:
        app: orchestration-center
    spec:
      containers:
      - name: orchestration-center
        image: orchestration-center:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 5001
        envFrom:
        - configMapRef:
            name: orchestration-center-config
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: orchestration-center-secret
              key: db-password
        - name: LLM_CHAT_API_KEY
          valueFrom:
            secretKeyRef:
              name: orchestration-center-secret
              key: llm-api-key
        - name: A2AT_LLM_API_KEY
          valueFrom:
            secretKeyRef:
              name: orchestration-center-secret
              key: a2at-llm-api-key
        startupProbe:
          httpGet:
            path: /rest/v1/orchestrate/agent-cards
            port: 5001
          failureThreshold: 12
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /rest/v1/orchestrate/agent-cards
            port: 5001
          initialDelaySeconds: 40
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /rest/v1/orchestrate/agent-cards
            port: 5001
          initialDelaySeconds: 10
          periodSeconds: 10
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/deployment.yaml --dry-run=client
```
Expected: `deployment.apps/orchestration-center created (dry run)`

- [ ] **Step 3: Commit**

```bash
git add k8s/deployment.yaml
git commit -m "feat(k8s): add orchestration-center Deployment with probes"
```

---

### Task 6: Service

**Files:**
- Create: `k8s/service.yaml`

- [ ] **Step 1: Create service.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

apiVersion: v1
kind: Service
metadata:
  name: orchestration-center
  namespace: orchestration-center
  labels:
    app: orchestration-center
spec:
  type: ClusterIP
  selector:
    app: orchestration-center
  ports:
  - port: 80
    targetPort: 5001
    protocol: TCP
    name: http
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/service.yaml --dry-run=client
```
Expected: `service/orchestration-center created (dry run)`

- [ ] **Step 3: Commit**

```bash
git add k8s/service.yaml
git commit -m "feat(k8s): add ClusterIP Service"
```

---

### Task 7: Ingress

**Files:**
- Create: `k8s/ingress.yaml`

- [ ] **Step 1: Create ingress.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# BEFORE DEPLOYING: Replace "orchestration-center.example.com" with your actual domain.
# To enable TLS, uncomment the tls section and configure your certificate.

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orchestration-center
  namespace: orchestration-center
  labels:
    app: orchestration-center
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  ingressClassName: nginx
  # tls:
  # - hosts:
  #   - orchestration-center.example.com
  #   secretName: orchestration-center-tls
  rules:
  - host: orchestration-center.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: orchestration-center
            port:
              number: 80
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/ingress.yaml --dry-run=client
```
Expected: `ingress.networking.k8s.io/orchestration-center created (dry run)`

- [ ] **Step 3: Commit**

```bash
git add k8s/ingress.yaml
git commit -m "feat(k8s): add Nginx Ingress with timeout annotations"
```

---

### Task 8: HPA

**Files:**
- Create: `k8s/hpa.yaml`

- [ ] **Step 1: Create hpa.yaml**

```yaml
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orchestration-center
  namespace: orchestration-center
  labels:
    app: orchestration-center
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orchestration-center
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```powershell
kubectl apply -f k8s/hpa.yaml --dry-run=client
```
Expected: `horizontalpodautoscaler.autoscaling/orchestration-center created (dry run)`

- [ ] **Step 3: Commit**

```bash
git add k8s/hpa.yaml
git commit -m "feat(k8s): add HPA for autoscaling"
```

---

### Task 9: Full Validation

**Files:**
- All files in `k8s/`

- [ ] **Step 1: Validate all files together**

Run:
```powershell
kubectl apply -f k8s/ --dry-run=client
```
Expected output (all resources created in dry run):
```
namespace/orchestration-center created (dry run)
secret/orchestration-center-secret created (dry run)
configmap/orchestration-center-config created (dry run)
service/orchestration-postgres created (dry run)
statefulset.apps/orchestration-postgres created (dry run)
deployment.apps/orchestration-center created (dry run)
service/orchestration-center created (dry run)
ingress.networking.k8s.io/orchestration-center created (dry run)
horizontalpodautoscaler.autoscaling/orchestration-center created (dry run)
```

- [ ] **Step 2: Verify file structure**

Run:
```powershell
Get-ChildItem k8s/ -Name
```
Expected:
```
configmap.yaml
deployment.yaml
hpa.yaml
ingress.yaml
namespace.yaml
postgres-statefulset.yaml
secret.yaml
service.yaml
```

- [ ] **Step 3: Final commit (if any fixes were made)**

```bash
git add k8s/
git commit -m "feat(k8s): complete K8S deployment manifests"
```
