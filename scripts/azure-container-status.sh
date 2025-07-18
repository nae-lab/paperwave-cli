#!/usr/bin/env bash

# Script to check the status of Azure Container Instance
# Usage: ./azure-container-status.sh [container_name]
# If container_name is not specified, a selection UI will be displayed

# Load common environment variables
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/load-azure-env.sh"

if ! load_azure_env; then
  exit 1
fi

# If container name is specified as an argument
if [ -n "$1" ]; then
  CONTAINER_NAME="$1"
  echo "Checking status of specified container: ${CONTAINER_NAME}"
  
  # Check if the container exists
  if ! az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" &>/dev/null; then
    echo "Error: Container '${CONTAINER_NAME}' not found"
    exit 1
  fi
  
  # Show details
  echo "=== Container Details ==="
  az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --output table
  
  echo ""
  echo "=== Container Status ==="
  az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --query "{Name:name, State:instanceView.state, RestartCount:instanceView.restartCount, CPU:containers[0].resources.requests.cpu, Memory:containers[0].resources.requests.memoryInGb, IP:ipAddress.ip, FQDN:ipAddress.fqdn}" --output table
  
  echo ""
  echo "=== Latest Container Logs ==="
  az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --tail 20
  
  exit 0
fi

# Get list of containers
echo "Fetching Azure Container Instances list..."
CONTAINERS=$(az container list --resource-group "${AZURE_RESOURCE_GROUP}" --query "[].name" --output tsv)

if [ -z "${CONTAINERS}" ]; then
  echo "No containers found in resource group '${AZURE_RESOURCE_GROUP}'"
  exit 1
fi

# Check the number of containers
CONTAINER_COUNT=$(echo "${CONTAINERS}" | wc -l)

if [ "${CONTAINER_COUNT}" -eq 1 ]; then
  # If only one container, select automatically
  CONTAINER_NAME="${CONTAINERS}"
  echo "One container found. Automatically selected: ${CONTAINER_NAME}"
  
  # Show details
  echo "=== Container Details ==="
  az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --output table
  
  echo ""
  echo "=== Container Status ==="
  az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --query "{Name:name, State:instanceView.state, RestartCount:instanceView.restartCount, CPU:containers[0].resources.requests.cpu, Memory:containers[0].resources.requests.memoryInGb, IP:ipAddress.ip, FQDN:ipAddress.fqdn}" --output table
  
  echo ""
  echo "=== Latest Container Logs ==="
  az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --tail 20
else
  # If multiple containers, show selection UI
  echo "Multiple containers found. Please select a container to check status:"
  echo ""
  
  # Convert to array
  readarray -t CONTAINER_ARRAY <<< "${CONTAINERS}"
  
  # Show options
  for i in "${!CONTAINER_ARRAY[@]}"; do
    echo "$((i + 1)). ${CONTAINER_ARRAY[i]}"
  done
  
  echo ""
  read -p "Please select (1-${CONTAINER_COUNT}): " CHOICE
  
  # Validate input
  if ! [[ "${CHOICE}" =~ ^[0-9]+$ ]] || [ "${CHOICE}" -lt 1 ] || [ "${CHOICE}" -gt "${CONTAINER_COUNT}" ]; then
    echo "Error: Invalid selection"
    exit 1
  fi
  
  # Show status for selected container
  SELECTED_CONTAINER="${CONTAINER_ARRAY[$((CHOICE - 1))]}"
  echo "Selected container: ${SELECTED_CONTAINER}"
  
  # Show details
  echo "=== Container Details ==="
  az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${SELECTED_CONTAINER}" --output table
  
  echo ""
  echo "=== Container Status ==="
  az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${SELECTED_CONTAINER}" --query "{Name:name, State:instanceView.state, RestartCount:instanceView.restartCount, CPU:containers[0].resources.requests.cpu, Memory:containers[0].resources.requests.memoryInGb, IP:ipAddress.ip, FQDN:ipAddress.fqdn}" --output table
  
  echo ""
  echo "=== Latest Container Logs ==="
  az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${SELECTED_CONTAINER}" --tail 20
fi 