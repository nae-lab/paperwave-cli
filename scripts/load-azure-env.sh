#!/usr/bin/env bash

# Azure関連スクリプト用の共通環境変数読み込み関数
load_azure_env() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  
  # Node.jsスクリプトで環境変数を読み込み
  if ! command -v node &> /dev/null; then
    echo "エラー: Node.js が見つかりません"
    return 1
  fi
  
  # .envファイルの存在確認
  if [ ! -f "${script_dir}/../.env" ]; then
    echo "エラー: .env ファイルが見つかりません"
    return 1
  fi
  
  # 環境変数を読み込み
  eval "$(node "${script_dir}/env-utils.js" export)"
  
  # 必須変数の確認
  if [ -z "${AZURE_RESOURCE_GROUP}" ]; then
    echo "エラー: AZURE_RESOURCE_GROUP が設定されていません"
    return 1
  fi
  
  return 0
} 