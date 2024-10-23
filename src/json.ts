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
 * Description: Utility functions for JSON parsing and repair.
 */

import { jsonrepair } from "jsonrepair";

import { ChatCompletion } from "./openai/chat";
import { consola } from "./logging";

export function extractJSONString(text: string) {
  const jsonRegex = /\{.*\}/ms;
  const match = text.match(jsonRegex);

  if (!match) {
    throw new Error("No JSON object found in text");
  }

  return match[0];
}

export async function parseJSON<T>(json: string) {
  let data: T;

  try {
    data = JSON.parse(json) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      consola.warn(`Message is not valid JSON: ${json}`);

      try {
        // try fixing the JSON
        consola.info("Trying to fix JSON by jsonrepair");
        const fixedJSON = jsonrepair(json);

        data = JSON.parse(fixedJSON) as T;
      } catch (error) {
        consola.warn("Failed to fix JSON by jsonrepair");
        consola.info("Trying to fix JSON by GPT");

        const chatCompletion = new ChatCompletion(
          `
# Role
JSON Fixer

# Instructions
Fix the JSON

# Input
Invalid JSON text

## Input example
\`\`\`json
{"totalTurns":18,"program":[{"title":"Background","conversationTurns":6}{"title":"Method","conversationTurns":6"}]}}
\`\`\`

# Output
Valid JSON text

## Output example
\`\`\`json
{"totalTurns":18,"program":[{"title":"Background","conversationTurns":6},{"title":"Method","conversationTurns":6}]}
\`\`\`
`,
          {
            model: "gpt-4o-mini",
            temperature: 0.25,
            response_format: {
              type: "json_object",
            },
          }
        );
        const fixResult = (
          await chatCompletion.completion("Fix the following JSON\n\n" + json)
        ).content?.toString();
        if (!fixResult) {
          throw new Error("Failed to fix JSON");
        }
        const fixedString = extractJSONString(fixResult);

        if (fixedString) {
          data = JSON.parse(fixedString) as T;
        } else {
          throw new Error("Failed to fix JSON");
        }
      }
    } else {
      throw error;
    }
  }

  return data;
}
