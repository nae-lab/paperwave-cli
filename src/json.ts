import { ChatCompletion } from "./openai/chat";
import { consola } from "./logging";
import { argv } from "./args";

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

      // try fixing the JSON
      consola.info("Trying to fix JSON");
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
{"totalTurns":18,"program":[{"title":"研究の目的と背景","conversationTurns":6}{"title":"教育実践におけるAliceの効果","conversationTurns":6"}]}}
\`\`\`

# Output
Valid JSON text

## Output example
\`\`\`json
{"totalTurns":18,"program":[{"title":"研究の目的と背景","conversationTurns":6},{"title":"教育実践におけるAliceの効果","conversationTurns":6}]}
\`\`\`
`,
        {
          temperature: 0.1,
        }
      );
      const fixResult = (
        await chatCompletion.completion(json)
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
    } else {
      throw error;
    }
  }

  return data;
}
