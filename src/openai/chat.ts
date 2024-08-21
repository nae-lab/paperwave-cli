import OpenAI from "openai";
import { ChatCompletionCreateParamsStreaming } from "openai/resources/index";
import { Stream } from "openai/streaming";

import { openai } from "../openai";
import { consola, runId } from "../logging";
import { spinnies } from "../spinnies";
import { argv } from "../args";
import { randomUUID } from "crypto";

type ChatCompletionStreamingOptions = Omit<
  ChatCompletionCreateParamsStreaming,
  "messages" | "stream"
>;

type ChatCompletionOptions = ChatCompletionStreamingOptions & {
  retryCount?: number;
  retryMaxDelay?: number;
};

export class ChatCompletion {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  systemPrompt: string;
  options?: ChatCompletionStreamingOptions;
  retryCount: number = 5;
  retryMaxDelay: number = 150000;

  constructor(systemPrompt: string, options?: ChatCompletionOptions) {
    this.systemPrompt = systemPrompt;
    // Omit the retry options from the streaming options
    this.options = options
      ? (Object.fromEntries(
          Object.entries(options).filter(
            ([key]) => !["retryCount", "retryMaxDelay"].includes(key)
          )
        ) as ChatCompletionStreamingOptions)
      : undefined;
    this.retryCount = options?.retryCount ?? this.retryCount;
    this.retryMaxDelay = options?.retryMaxDelay ?? this.retryMaxDelay;
  }

  reset() {
    this.messages = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  async completion(
    message: string
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    this.messages.push({
      role: "user",
      content: message,
    });

    const stream = await openai.chat.completions.create({
      messages: this.messages,
      model: (await argv).gptModel,
      stream: true,
      ...this.options,
    });

    let result: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "assistant",
      content: "",
    };

    const spinnieName = "chatcmpl-" + randomUUID();
    let spinnieDisplayName: string | undefined = undefined;
    spinnies?.add(spinnieName, { text: `${spinnieDisplayName}: start` });

    let snapshot_length = 0;
    for await (const chunk of stream) {
      if (spinnieDisplayName === undefined) {
        spinnieDisplayName = chunk.id;
        spinnies?.update(spinnieName, {
          text: `${spinnieDisplayName}: ${result.content}`,
        });
      }

      result.content += chunk.choices[0].delta.content ?? "";

      if (chunk.choices[0].finish_reason === "content_filter") {
        consola.warn("Text generation stopped due to content filter");
        break;
      } else if (chunk.choices[0].finish_reason === "length") {
        consola.warn("Text generation stopped due to length");
        break;
      }

      if ((result.content?.length ?? 0) - snapshot_length > 30) {
        snapshot_length = result.content?.length ?? 0;
        spinnies?.update(spinnieName, {
          text: `${spinnieDisplayName}: ${result.content
            ?.toString()
            .slice(-60)
            .replace(/\s/g, " ")}`,
        });
      }
    }

    spinnies?.succeed(spinnieName, { text: `${spinnieDisplayName}: finished` });
    consola
      .withTag(spinnieDisplayName ?? "")
      .debug(`Text generation finished for ${spinnieDisplayName}`);
    consola.withTag(spinnieDisplayName ?? "").verbose(result);

    this.messages.push(result);

    return result;
  }
}
