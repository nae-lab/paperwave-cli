#!/usr/bin/env bash

# Script to display the list of Azure Container Instances
# Usage: ./azure-container-list.sh

# Load common environment variables
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/load-azure-env.sh"

if ! load_azure_env; then
  exit 1
fi

echo "Fetching Azure Container Instances list..."
echo "Resource Group: ${AZURE_RESOURCE_GROUP}"
echo ""

# Get container list with details
az container list \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --output table \
  --query "[].{Name:name, State:instanceView.state, IP:ipAddress.ip, FQDN:ipAddress.fqdn, CPU:containers[0].resources.requests.cpu, Memory:containers[0].resources.requests.memoryInGb, Image:containers[0].image}"

echo ""
echo "To check details: pnpm run azure:container:log [container_name]" 