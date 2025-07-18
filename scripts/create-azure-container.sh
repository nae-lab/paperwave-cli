#!/usr/bin/env bash

# Azure Container Instance作成スクリプト
# 使用方法: ./create-azure-container.sh [environment-suffix]

# 共通環境変数読み込み
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/load-azure-env.sh"

if ! load_azure_env; then
  exit 1
fi

# 引数チェック
if [ -z "$1" ]; then
    echo "エラー: 引数が必要です"
    echo "使用方法: $0 <environment-suffix>"
    echo "例: $0 dev"
    exit 1
fi

# インスタンス名の生成
INSTANCE_ID=$(date +"%Y%m%d-%H%M%S")
CONTAINER_NAME="paperwave-$1-${INSTANCE_ID}"

echo "Azure Container Instance を作成中..."
echo "名前: ${CONTAINER_NAME}"
echo "リソースグループ: ${AZURE_RESOURCE_GROUP}"
echo "イメージ: ${PAPERWAVE_DOCKER_REGISTRY}:latest"

ENV_VARS=(
    "LOG_DIR=${LOG_DIR}"
    "EPISODES_COLLECTION_ID=${EPISODES_COLLECTION_ID}"
    "FIREBASE_SERVICE_ACCOUNT_KEY=${FIREBASE_SERVICE_ACCOUNT_KEY}"
    "OPENAI_API_KEY=${OPENAI_API_KEY}"
    "AZURE_SWEDEN_CENTRAL_OPENAI_API_VERSION=${AZURE_SWEDEN_CENTRAL_OPENAI_API_VERSION}"
    "AZURE_SWEDEN_CENTRAL_OPENAI_API_KEY=${AZURE_SWEDEN_CENTRAL_OPENAI_API_KEY}"
    "AZURE_SWEDEN_CENTRAL_OPENAI_ENDPOINT=${AZURE_SWEDEN_CENTRAL_OPENAI_ENDPOINT}"
    "AZURE_EAST_US2_OPENAI_API_VERSION=${AZURE_EAST_US2_OPENAI_API_VERSION}"
    "AZURE_EAST_US2_OPENAI_API_KEY=${AZURE_EAST_US2_OPENAI_API_KEY}"
    "AZURE_EAST_US2_OPENAI_ENDPOINT=${AZURE_EAST_US2_OPENAI_ENDPOINT}"
    "AZURE_OPENAI_TTS_API_VERSION=${AZURE_OPENAI_TTS_API_VERSION}"
    "AZURE_OPENAI_TTS_API_KEY=${AZURE_OPENAI_TTS_API_KEY}"
    "AZURE_OPENAI_TTS_ENDPOINT=${AZURE_OPENAI_TTS_ENDPOINT}"
    "AZURE_OPENAI_TTS_DEPLOYMENT_NAME=${AZURE_OPENAI_TTS_DEPLOYMENT_NAME}"
    "SLACK_TOKEN=${SLACK_TOKEN}"
    "SLACK_ALERT_CHANNEL_ID=${SLACK_ALERT_CHANNEL_ID}"
    "PAPERWAVE_DOCKER_REGISTRY=${PAPERWAVE_DOCKER_REGISTRY}"
    "ACR_LOGIN_SERVER=${ACR_LOGIN_SERVER}"
    "ACR_USERNAME=${ACR_USERNAME}"
    "ACR_PASSWORD=${ACR_PASSWORD}"
)

# Azure Container Instanceを作成
az container create \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${CONTAINER_NAME}" \
    --image "${PAPERWAVE_DOCKER_REGISTRY}:latest" \
    --registry-login-server "${ACR_LOGIN_SERVER}" \
    --registry-username "${ACR_USERNAME}" \
    --registry-password "${ACR_PASSWORD}" \
    --cpu 4 \
    --memory 8 \
    --os-type Linux \
    --restart-policy OnFailure \
    --environment-variables "${ENV_VARS[@]}"

if [ $? -eq 0 ]; then
    echo "✅ Azure Container Instance が正常に作成されました"
    echo "名前: ${CONTAINER_NAME}"
    echo "リソースグループ: ${AZURE_RESOURCE_GROUP}"
else
    echo "❌ Azure Container Instance の作成に失敗しました"
    exit 1
fi 