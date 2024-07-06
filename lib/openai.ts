import OpenAI from "openai";
import { ThreadCreateParams } from "openai/resources/beta/index";
import {
  AssistantStream,
  RunCreateParamsBaseStream,
} from "openai/lib/AssistantStream";

import { consola } from "./consola";
import { spinnies } from "./spinnies";

export const openai = new OpenAI();

export async function streamAndWait(
  threadId: string,
  body: RunCreateParamsBaseStream,
  spinnieName?: string
): Promise<AssistantStream> {
  return new Promise((resolve, reject) => {
    const stream = openai.beta.threads.runs.stream(threadId, body);

    stream.on("textCreated", (text) => {
      consola.withTag(threadId).verbose("assistant > ");
    });

    let snapshot_length = 0;
    stream.on("textDelta", (textDelta, snapshot) => {
      consola.withTag(threadId).verbose(textDelta.value as string);
      if (spinnieName && snapshot.value.length > snapshot_length + 30) {
        const status = `${threadId}: ${snapshot.value
          .slice(-60)
          .replace(/\s/g, " ")}`;
        spinnies.update(spinnieName, { text: status });
        snapshot_length = snapshot.value.length;
      }
    });

    stream.on("toolCallCreated", (toolCall) => {
      consola.withTag(threadId).verbose(`assistant > ${toolCall.type}`);
      if (spinnieName) {
        spinnies.update(spinnieName, { text: `${threadId}: ${toolCall.type}` });
      }
    });

    stream.on("error", (error) => {
      reject(error);
    });

    stream.on("end", () => {
      resolve(stream);
    });
  });
}

export async function runAssistant(
  assistant_id: string,
  messages: ThreadCreateParams.Message[]
) {
  const thread = await openai.beta.threads.create({
    messages: messages,
  });
  consola.withTag(thread.id).debug("Thread created");

  const spinnieName = thread.id;
  spinnies.add(spinnieName, { text: `${thread.id}: start` });

  const run = await streamAndWait(
    thread.id,
    {
      assistant_id: assistant_id,
      model: "gpt-4o",
      tool_choice: {
        type: "file_search",
      },
      response_format: {
        type: "text",
      },
    },
    spinnieName
  );

  // 全てのメッセージを取得する
  const results = await openai.beta.threads.messages.list(thread.id, {
    order: "asc",
  });
  consola.withTag(thread.id).debug("Messages retrieved");
  consola.withTag(thread.id).verbose(results.data);
  const assistantMessages = results.data.filter(
    (message) => message.role === "assistant"
  );

  spinnies.succeed(spinnieName, { text: `${thread.id}: finished` });

  return assistantMessages;
}
