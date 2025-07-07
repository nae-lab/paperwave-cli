/*
 * Copyright 2025 Naemura Laboratory, the University of Tokyo
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Description: OpenAI API configuration
 */

import { AzureOpenAI } from "openai";
import OpenAI from "openai";

// Sweden Central configuration
const swedenCentralConfig = {
  apiVersion: process.env.AZURE_SWEDEN_CENTRAL_OPENAI_API_VERSION,
  apiKey: process.env.AZURE_SWEDEN_CENTRAL_OPENAI_API_KEY,
  endpoint: process.env.AZURE_SWEDEN_CENTRAL_OPENAI_ENDPOINT,
};

// East US2 configuration
const eastUS2Config = {
  apiVersion: process.env.AZURE_EAST_US2_OPENAI_API_VERSION,
  apiKey: process.env.AZURE_EAST_US2_OPENAI_API_KEY,
  endpoint: process.env.AZURE_EAST_US2_OPENAI_ENDPOINT,
};

// Function to get a random Azure OpenAI instance
export function getRandomAzureOpenAI(): AzureOpenAI {
  const useSweden = Math.random() < 0.5;
  const config = useSweden ? swedenCentralConfig : eastUS2Config;

  return new AzureOpenAI(config);
}

// Legacy export for backward compatibility (uses Sweden Central by default)
// Initialize lazily to avoid errors when environment variables are not set
let _azureOpenai: AzureOpenAI | undefined;
export const azureOpenai = (() => {
  if (!_azureOpenai) {
    _azureOpenai = new AzureOpenAI(swedenCentralConfig);
  }
  return _azureOpenai;
})();

export const azureTTS = new AzureOpenAI({
  apiVersion: process.env.AZURE_OPENAI_TTS_API_VERSION,
  apiKey: process.env.AZURE_OPENAI_TTS_API_KEY,
  endpoint: process.env.AZURE_OPENAI_TTS_ENDPOINT,
  deployment: process.env.AZURE_OPENAI_TTS_DEPLOYMENT_NAME,
});

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
