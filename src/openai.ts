/*
 * Copyright 2024 Naemura Laboratory, the University of Tokyo
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

export const azureOpenaiGpt4o = new AzureOpenAI({
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
});

export const azureTTS = new AzureOpenAI({
  apiVersion: process.env.AZURE_OPENAI_TTS_API_VERSION,
  apiKey: process.env.AZURE_OPENAI_TTS_API_KEY,
  endpoint: process.env.AZURE_OPENAI_TTS_ENDPOINT,
  deployment: process.env.AZURE_OPENAI_TTS_DEPLOYMENT_NAME,
});

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
