#!/usr/bin/env bash

# Script to check Azure Container Instance logs
# Usage: ./azure-container-logs.sh [-f] [container_name]
# -f: Follow logs in real time (same as Docker -f)
# If container_name is not specified, a selection UI will be displayed

# Load common environment variables
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/load-azure-env.sh"

if ! load_azure_env; then
  exit 1
fi

# Parse options
FOLLOW_MODE=false
CONTAINER_NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--follow)
      FOLLOW_MODE=true
      shift
      ;;
    *)
      if [ -z "${CONTAINER_NAME}" ]; then
        CONTAINER_NAME="$1"
      fi
      shift
      ;;
  esac
done

# If container name is specified as an argument
if [ -n "${CONTAINER_NAME}" ]; then
  echo "Fetching logs for specified container: ${CONTAINER_NAME}"
  
  # Check if the container exists
  if ! az container show --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" &>/dev/null; then
    echo "Error: Container '${CONTAINER_NAME}' not found"
    exit 1
  fi
  
  # Show logs
  if [ "${FOLLOW_MODE}" = true ]; then
    echo "Following logs... (Ctrl+C to exit)"
    az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --follow
  else
    az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}"
  fi
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
  
  # Show logs
  if [ "${FOLLOW_MODE}" = true ]; then
    echo "Following logs... (Ctrl+C to exit)"
    az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}" --follow
  else
    echo "Fetching logs..."
    az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${CONTAINER_NAME}"
  fi
else
  # If multiple containers, show selection UI
  echo "Multiple containers found. Please select:"
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
  
  # Show logs for selected container
  SELECTED_CONTAINER="${CONTAINER_ARRAY[$((CHOICE - 1))]}"
  echo "Selected container: ${SELECTED_CONTAINER}"
  
  # Show logs
  if [ "${FOLLOW_MODE}" = true ]; then
    echo "Following logs... (Ctrl+C to exit)"
    az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${SELECTED_CONTAINER}" --follow
  else
    echo "Fetching logs..."
    az container logs --resource-group "${AZURE_RESOURCE_GROUP}" --name "${SELECTED_CONTAINER}"
  fi
fi 