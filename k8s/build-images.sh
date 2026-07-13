#!/bin/bash
# OpenAN Platform - 镜像构建与推送脚本
# 用法: ./build-images.sh [options]
#
# 选项:
#   --registry <url>    镜像仓库地址 (默认: docker.io)
#   --namespace <ns>    镜像命名空间 (默认: openan)
#   --tag <tag>         镜像标签 (默认: latest)
#   --push              构建后推送到仓库
#   --help              显示帮助信息

set -e

# 默认配置
REGISTRY="docker.io"
NAMESPACE="openan"
TAG="latest"
PUSH=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --help)
            echo "用法: $0 [options]"
            echo ""
            echo "选项:"
            echo "  --registry <url>    镜像仓库地址 (默认: docker.io)"
            echo "  --namespace <ns>    镜像命名空间 (默认: openan)"
            echo "  --tag <tag>         镜像标签 (默认: latest)"
            echo "  --push              构建后推送到仓库"
            echo "  --help              显示帮助信息"
            echo ""
            echo "示例:"
            echo "  # 本地构建"
            echo "  $0"
            echo ""
            echo "  # 构建并推送到私有仓库"
            echo "  $0 --registry harbor.example.com --namespace openan --tag v1.0.0 --push"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            exit 1
            ;;
    esac
done

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "OpenAN Platform - 镜像构建"
echo "=========================================="
echo "Registry:  $REGISTRY"
echo "Namespace: $NAMESPACE"
echo "Tag:       $TAG"
echo "Push:      $PUSH"
echo "=========================================="
echo ""

# 镜像名称定义
REGISTRY_IMAGE="$REGISTRY/$NAMESPACE/registry-center:$TAG"
ORCHESTRATION_IMAGE="$REGISTRY/$NAMESPACE/orchestration-center:$TAG"
FRONTEND_IMAGE="$REGISTRY/$NAMESPACE/workflow-designer:$TAG"

# 构建 Registry Center
echo "[1/3] 构建 Registry Center..."
cd "$PROJECT_ROOT/../registry-center"
docker build -t "$REGISTRY_IMAGE" .
echo "✓ Registry Center 镜像: $REGISTRY_IMAGE"
echo ""

# 构建 Orchestration Center
echo "[2/3] 构建 Orchestration Center..."
cd "$PROJECT_ROOT"
docker build -t "$ORCHESTRATION_IMAGE" .
echo "✓ Orchestration Center 镜像: $ORCHESTRATION_IMAGE"
echo ""

# 构建 Workflow Designer
echo "[3/3] 构建 Workflow Designer..."
cd "$PROJECT_ROOT/workflow-designer"
docker build -t "$FRONTEND_IMAGE" .
echo "✓ Workflow Designer 镜像: $FRONTEND_IMAGE"
echo ""

# 推送镜像
if [ "$PUSH" = true ]; then
    echo "=========================================="
    echo "推送镜像到仓库..."
    echo "=========================================="
    
    echo "[1/3] 推送 Registry Center..."
    docker push "$REGISTRY_IMAGE"
    
    echo "[2/3] 推送 Orchestration Center..."
    docker push "$ORCHESTRATION_IMAGE"
    
    echo "[3/3] 推送 Workflow Designer..."
    docker push "$FRONTEND_IMAGE"
    
    echo ""
    echo "✓ 所有镜像推送完成"
fi

echo ""
echo "=========================================="
echo "构建完成！"
echo "=========================================="
echo ""
echo "镜像列表:"
echo "  - $REGISTRY_IMAGE"
echo "  - $ORCHESTRATION_IMAGE"
echo "  - $FRONTEND_IMAGE"
echo ""
echo "使用 Helm 部署:"
echo "  helm install openan ./k8s/openan-chart \\"
echo "    --set registry.image.repository=$REGISTRY/$NAMESPACE/registry-center \\"
echo "    --set registry.image.tag=$TAG \\"
echo "    --set orchestration.image.repository=$REGISTRY/$NAMESPACE/orchestration-center \\"
echo "    --set orchestration.image.tag=$TAG \\"
echo "    --set frontend.image.repository=$REGISTRY/$NAMESPACE/workflow-designer \\"
echo "    --set frontend.image.tag=$TAG"
echo ""
