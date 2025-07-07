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
 * Description: Chat completion using OpenAI's Chat API.
 */

import OpenAI from "openai";
import { ChatCompletionCreateParamsStreaming } from "openai/resources/index";
import { Stream } from "openai/streaming";

import { getRandomAzureOpenAI } from "../openai";
import { AzureOpenAI } from "openai";
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
  private azureOpenAIClient: AzureOpenAI;

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
    // Initialize with a random region client that will be used consistently
    this.azureOpenAIClient = getRandomAzureOpenAI();
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

    const model = this.options?.model ?? (await argv).llmModel;
    const oModels = ["o1", "o3-mini"];
    const isOModel = oModels.includes(model);
    const basePayload: any = {
      messages: this.messages,
      model,
      stream: true,
    };
    if (isOModel) {
      basePayload.reasoning_effort = "high";
      // temperature/top_pは付与しない
    } else {
      if (this.options?.temperature !== undefined)
        basePayload.temperature = this.options.temperature;
      if (this.options?.top_p !== undefined)
        basePayload.top_p = this.options.top_p;
    }
    // その他のオプションを追加
    if (this.options) {
      for (const [key, value] of Object.entries(this.options)) {
        if (["model", "temperature", "top_p"].includes(key)) continue;
        basePayload[key] = value;
      }
    }
    const stream = await this.azureOpenAIClient.chat.completions.create(
      basePayload
    );

    let result: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "assistant",
      content: "",
    };

    const spinnieName = "chatcmpl-" + randomUUID();
    let spinnieDisplayName: string | undefined = undefined;
    spinnies?.add(spinnieName, { text: `${spinnieDisplayName}: start` });

    let snapshot_length = 0;
    // for-await-ofでイテレート可能か判定
    if (
      typeof stream === "object" &&
      stream !== null &&
      typeof (stream as any)[Symbol.asyncIterator] === "function"
    ) {
      for await (const chunk of stream as any) {
        if (spinnieDisplayName === undefined) {
          spinnieDisplayName = (chunk as any).id;
          spinnies?.update(spinnieName, {
            text: `${spinnieDisplayName}: ${result.content}`,
          });
        }
        result.content += (chunk as any).choices?.[0]?.delta?.content ?? "";
        if ((chunk as any).choices?.[0]?.finish_reason === "content_filter") {
          consola.warn("Text generation stopped due to content filter");
          break;
        } else if ((chunk as any).choices?.[0]?.finish_reason === "length") {
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
    } else {
      // ストリームでない場合（o系モデル+reasoning時など）
      const choices = (stream as any).choices;
      if (choices && Array.isArray(choices) && choices[0]?.message?.content) {
        result.content = choices[0].message.content;
      } else if (
        choices &&
        Array.isArray(choices) &&
        choices[0]?.delta?.content
      ) {
        result.content = choices[0].delta.content;
      } else {
        result.content = "";
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
