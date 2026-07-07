# OpenAN Platform Kubernetes 部署设计文档

**版本**: 1.0  
**日期**: 2026-07-07  
**状态**: 已实现

## 1. 概述

本文档描述 OpenAN 平台（Registry Center + Orchestration Center）在 Kubernetes 集群上的部署设计。提供两种部署方式：

1. **纯 YAML 部署**：适用于简单场景、快速验证
2. **Helm Chart 部署**：适用于生产环境、多配置管理

## 2. 平台架构

### 2.1 组件关系

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenAN Platform                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────┐         ┌─────────────────────────────┐  │
│   │ Orchestration       │         │ Registry Center             │  │
│   │ Center              │────────▶│                             │  │
│   │                     │  HTTP   │  - Agent 注册/发现          │  │
│   │  - 工作流编排       │  :5000  │  - 语义搜索                 │  │
│   │  - PSOP 生成        │         │  - LLM (chat/embed/rerank)  │  │
│   │  - LLM (chat)       │         │                             │  │
│   │  - A2AT SDK         │         │                             │  │
│   └─────────┬───────────┘         └──────────────┬──────────────┘  │
│             │                                     │                 │
│             └──────────────┬──────────────────────┘                 │
│                            │                                        │
│                            ▼                                        │
│             ┌──────────────────────────────┐                       │
│             │ PostgreSQL (共享实例)         │                       │
│             │                              │                       │
│             │  - registry_center DB        │                       │
│             │  - orchestration_center DB   │                       │
│             └──────────────────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 组件对比

| 特性 | Registry Center | Orchestration Center |
|------|-----------------|---------------------|
| **端口** | 5000 | 5001 |
| **数据库** | registry_center | orchestration_center |
| **LLM 用途** | 语义搜索、Embedding、Rerank | PSOP 生成、工作流执行、协商 |
| **LLM 模型** | chat + embed + rerank | chat + a2at |
| **依赖** | 独立 | 依赖 Registry Center |
| **可选性** | 必选 | 可选 |
| **资源** | 512Mi/500m | 1Gi/1000m |

## 3. 部署方式设计

### 3.1 纯 YAML 部署

#### 设计理念

- **简单直接**：每个资源一个文件，易于理解和修改
- **手动控制**：通过选择性地 `kubectl apply` 控制部署内容
- **零学习成本**：不需要学习 Helm 模板语法

#### 文件结构

```
k8s/
├── namespace.yaml              # Namespace: openan
├── secret.yaml                 # DB 密码、LLM API Keys
├── configmap.yaml              # 环境变量配置
├── postgres-statefulset.yaml   # PostgreSQL StatefulSet
├── deployment.yaml             # orchestration-center Deployment
├── service.yaml                # ClusterIP Service
├── ingress.yaml                # Nginx Ingress
└── hpa.yaml                    # 自动伸缩
```

#### 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 文件组织 | 按资源类型分文件 | 清晰、易于定位 |
| 配置方式 | ConfigMap + Secret | 分离敏感信息 |
| 数据库 | StatefulSet + PVC | 简单、自包含 |
| 服务发现 | ClusterIP Service | 集群内部通信 |
| 外部访问 | Nginx Ingress | 通用、支持 TLS |

#### 局限性

- 可选组件需手动排除文件
- 多环境需维护多套配置
- 配置变更需直接编辑 YAML

### 3.2 Helm Chart 部署

#### 设计理念

- **声明式配置**：通过 `values.yaml` 统一管理所有配置
- **可选组件**：通过 `enabled` 标志控制组件部署
- **多环境支持**：通过多个 values 文件支持 dev/prod 环境
- **版本管理**：Chart 版本化，支持升级和回滚

#### 文件结构

```
k8s/openan-chart/
├── Chart.yaml                           # Chart 元数据
├── values.yaml                          # 默认配置
└── templates/
    ├── _helpers.tpl                     # 模板函数
    ├── namespace.yaml                   # openan namespace
    ├── ingress.yaml                     # 统一入口
    ├── NOTES.txt                        # 部署提示
    ├── postgres/
    │   └── statefulset.yaml             # 共享 PostgreSQL
    ├── registry-center/
    │   ├── secret.yaml                  # registry 独立 secret
    │   ├── configmap.yaml               # registry 配置
    │   ├── deployment.yaml
    │   └── service.yaml                 # port 5000
    └── orchestration-center/
        ├── secret.yaml                  # orchestration 独立 secret
        ├── configmap.yaml
        ├── deployment.yaml
        ├── service.yaml                 # port 5001
        └── hpa.yaml
```

#### 核心设计

##### 3.2.1 可选组件

```yaml
# values.yaml
registry:
  enabled: true      # 必选，默认开启

orchestration:
  enabled: true      # 可选，可设为 false
```

模板中使用条件渲染：

```yaml
{{- if .Values.orchestration.enabled }}
apiVersion: apps/v1
kind: Deployment
...
{{- end }}
```

##### 3.2.2 独立 LLM 配置

两个服务各有独立的 LLM 配置，互不影响：

```yaml
# Registry Center LLM
registry:
  llm:
    chat:
      model: "deepseek-chat"
      url: "https://api.deepseek.com/v1/chat/completions"
      apiKey: ""
    embed:
      model: "bge-m3"
      url: ""
      apiKey: ""
    rerank:
      model: "bge-reranker-v2-m3"
      url: ""
      apiKey: ""

# Orchestration Center LLM
orchestration:
  llm:
    chat:
      model: "deepseek-chat"
      url: "https://api.deepseek.com/v1/chat/completions"
      apiKey: ""
  a2at:
    provider: "deepseek"
    model: "deepseek-chat"
    baseUrl: "https://api.deepseek.com"
    apiKey: ""
```

##### 3.2.3 共享 PostgreSQL

单个 PostgreSQL 实例，通过 init script 创建多个数据库：

```yaml
postgresql:
  enabled: true
  databases:
    - name: registry_center
      user: registry
    - name: orchestration_center
      user: opena2a_t
```

init script (`create-databases.sh`):
```bash
CREATE USER registry WITH PASSWORD '...';
CREATE DATABASE registry_center OWNER registry;
...
```

##### 3.2.4 服务发现

Orchestration Center 自动发现 Registry Center：

```yaml
# _helpers.tpl
{{- define "openan.registryUrl" -}}
{{- if .Values.orchestration.agentRegistryUrl }}
{{- .Values.orchestration.agentRegistryUrl }}
{{- else if .Values.registry.enabled }}
{{- printf "http://registry-center:%v" .Values.registry.port }}
{{- else }}
{{- "" }}
{{- end }}
{{- end }}
```

##### 3.2.5 Ingress 路由

统一入口，按路径分发：

```yaml
# ingress.yaml
rules:
- host: {{ .Values.ingress.host }}
  http:
    paths:
    {{- if .Values.orchestration.enabled }}
    - path: /
      backend:
        service:
          name: orchestration-center
          port:
            number: {{ .Values.orchestration.port }}
    {{- end }}
    {{- if .Values.registry.enabled }}
    - path: /registry
      backend:
        service:
          name: registry-center
          port:
            number: {{ .Values.registry.port }}
    {{- end }}
```

## 4. 资源设计

### 4.1 资源限制

| 组件 | requests | limits | 说明 |
|------|----------|--------|------|
| PostgreSQL | 250m/256Mi | 500m/512Mi | 轻量级数据库 |
| Registry Center | 250m/256Mi | 500m/512Mi | 无状态服务 |
| Orchestration Center | 250m/512Mi | 1000m/1Gi | LLM 调用较密集 |

### 4.2 健康检查

| 组件 | 端点 | 说明 |
|------|------|------|
| PostgreSQL | `pg_isready -U postgres` | 原生就绪检查 |
| Registry Center | `/rest/v1/registry-center/agent-cards` | 轻量级 API |
| Orchestration Center | `/rest/v1/orchestrate/agent-cards` | 轻量级 API |

### 4.3 自动伸缩

仅 Orchestration Center 配置 HPA：

```yaml
orchestration:
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70
    targetMemoryUtilization: 80
```

Registry Center 固定副本数，因为：
- 负载相对较低
- 需要保持与 VectorDB 的连接稳定

## 5. 安全设计

### 5.1 Secret 管理

支持两种方式：

1. **直接配置**：在 values.yaml 中配置 apiKey
2. **外部 Secret**：引用已存在的 K8S Secret

```yaml
# 方式 1：直接配置
registry:
  llm:
    chat:
      apiKey: "sk-xxx"

# 方式 2：外部 Secret
registry:
  llm:
    chat:
      existingSecret: "my-llm-secret"
      existingSecretKey: "api-key"
```

### 5.2 证书管理

Registry Center 需要两类证书：

| 证书类型 | 用途 | 容器路径 | 文件名 |
|----------|------|----------|--------|
| TLS 证书 | HTTPS 通信 | `etc/ssl/` | server.cer, server_key.pem, trust.cer |
| JWS 签名证书 | Agent Card 签名 | `etc/sign_cert/` | server.cer, server_key.pem, cert_pwd |

**证书模式设计：**

```
┌─────────────────────────────────────────────────────────────────┐
│                    证书模式选择                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  mode: auto (默认)                                              │
│  ├── entrypoint.sh 自动生成自签名证书                            │
│  ├── 每个 Pod 独立生成，证书不同                                 │
│  └── 适用：开发/测试，单副本                                     │
│                                                                 │
│  mode: secret                                                   │
│  ├── 从 K8S Secret 挂载到容器                                   │
│  ├── 所有 Pod 共享相同证书                                       │
│  └── 适用：生产环境，多副本                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**为什么生产环境必须用 secret 模式？**

1. **JWS 签名一致性**：Agent Card 签名需要所有副本使用相同证书，否则验证失败
2. **TLS 证书稳定**：避免每次重启重新生成，导致客户端信任问题
3. **证书轮换**：通过更新 Secret 实现证书轮换，无需重建镜像

**Helm 配置示例：**

```yaml
registry:
  tls:
    mode: secret
    existingSecret: registry-tls      # 包含 server.cer, server_key.pem, trust.cer
  signing:
    mode: secret
    existingSecret: registry-signing  # 包含 server.cer, server_key.pem, cert_pwd
```

**Deployment 挂载逻辑：**

```yaml
# templates/registry-center/deployment.yaml
{{- if eq .Values.registry.tls.mode "secret" }}
volumeMounts:
- name: tls-certs
  mountPath: /opt/registry-center/etc/ssl
  readOnly: true
{{- end }}

{{- if eq .Values.registry.signing.mode "secret" }}
volumeMounts:
- name: signing-certs
  mountPath: /opt/registry-center/etc/sign_cert
  readOnly: true
{{- end }}
```

### 5.3 网络安全

- 所有服务使用 ClusterIP，仅集群内部可访问
- 通过 Ingress 暴露外部访问
- 支持 TLS 终止

### 5.3 生产建议

| 建议 | 说明 |
|------|------|
| 使用外部 Secret 管理 | Vault、AWS Secrets Manager 等 |
| 启用 TLS | cert-manager 自动签发证书 |
| 网络策略 | NetworkPolicy 限制 Pod 间通信 |
| 镜像安全 | 私有仓库 + 镜像签名 |
| 资源配额 | ResourceQuota 限制命名空间资源 |

## 6. 部署场景

### 6.1 开发环境

```bash
helm install openan-dev ./k8s/openan-chart \
  -n openan-dev --create-namespace \
  --set postgresql.storage=10Gi \
  --set registry.replicas=1 \
  --set orchestration.replicas=1 \
  --set orchestration.hpa.enabled=false
```

### 6.2 生产环境

```bash
helm install openan-prod ./k8s/openan-chart \
  -n openan-prod --create-namespace \
  -f values-prod.yaml
```

### 6.3 仅 Registry Center

```bash
helm install openan ./k8s/openan-chart \
  -n openan --create-namespace \
  --set orchestration.enabled=false
```

### 6.4 外部数据库

```bash
helm install openan ./k8s/openan-chart \
  -n openan --create-namespace \
  --set postgresql.enabled=false \
  --set postgresql.externalHost=your-db.example.com
```

## 7. 两种方式对比

| 维度 | 纯 YAML | Helm Chart |
|------|---------|------------|
| **复杂度** | 低 | 中 |
| **灵活性** | 中 | 高 |
| **可维护性** | 低（多环境需多套文件） | 高（values 覆盖） |
| **可选组件** | 手动排除文件 | `--set enabled=false` |
| **配置管理** | 直接编辑 YAML | values.yaml + 命令行 |
| **版本管理** | 无 | Chart 版本化 |
| **升级回滚** | 手动 | `helm upgrade/rollback` |
| **学习成本** | 零 | 需学 Helm |
| **适用场景** | 快速验证、简单部署 | 生产环境、多环境管理 |

## 8. 总结

两种部署方式各有优势：

- **纯 YAML**：适合快速上手、简单场景，零学习成本
- **Helm Chart**：适合生产环境、多配置管理，支持可选组件和多环境

建议：
- 开发/测试环境：使用纯 YAML 快速验证
- 生产环境：使用 Helm Chart 管理配置和版本

两种方式可以共存，用户根据实际需求选择。
