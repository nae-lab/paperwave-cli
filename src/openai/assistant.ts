import fs from "fs";
import path from "path";
import process from "process";
import { backOff } from "exponential-backoff";
import OpenAI from "openai";
import { ThreadCreateParams } from "openai/resources/beta/index";
import {
  AssistantStream,
  RunCreateParamsBaseStream,
} from "openai/lib/AssistantStream";
import CLIProgress from "cli-progress";
import { randomUUID } from "crypto";

import { openai } from "../openai";
import { parseJSON, extractJSONString } from "../json";
import { consola, runId } from "../logging";
import { spinnies } from "../spinnies";
import { SingleBar } from "../progress";
import { argv } from "../args";

export const ASSISTANT_NAME_PREFIX = "llm-radio-file-search";
const RUN_REPEATE_COUNT = 10;

type FileSearchAssistantOptions = {
  name?: string;
  temperature?: number;
  topP?: number;
  llmModel?: string;
  retryCount?: number;
  retryMaxDelay?: number;
};

export class FileSearchAssistant {
  assistant?: OpenAI.Beta.Assistants.Assistant;
  readonly name: string;
  filePaths: string[] = [];
  uploadedFiles: OpenAI.Files.FileObject[] = [];
  vectorStore?: OpenAI.Beta.VectorStores.VectorStore;
  threadContext: ThreadCreateParams.Message[] = [];
  instructions: string;
  temperature?: number;
  topP?: number;
  llmModel?: string;
  retryCount?: number;
  retryMaxDelay?: number;

  constructor(
    filePaths: string[],
    instructions: string,
    options?: FileSearchAssistantOptions
  ) {
    this.name =
      `${ASSISTANT_NAME_PREFIX}_` +
      (options?.name ?? `file_search_${runId}_${randomUUID()}`);
    this.filePaths = filePaths;
    this.instructions = instructions;
    this.temperature = options?.temperature;
    this.topP = options?.topP;
    this.llmModel = options?.llmModel;
    this.retryCount = options?.retryCount;
    this.retryMaxDelay = options?.retryMaxDelay;
  }

  async init() {
    const bar = new SingleBar(
      {
        format: "[{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
        stopOnComplete: true,
      },
      CLIProgress.Presets.shades_classic
    );

    bar.start(this.filePaths.length, 0);

    const uploadPromises = this.filePaths.map(async (filePath) => {
      const uploadedFile = await this.uploadFile(filePath);
      bar.increment(1, { filename: path.basename(filePath) });
      return uploadedFile;
    });
    const uploadedFiles = await Promise.all(uploadPromises);
    bar.stop(`${uploadedFiles.length} files uploaded`);
    consola
      .withTag(this.assistant?.id ?? this.name ?? "unknown-assistant")
      .verbose("Uploaded files: ", uploadedFiles);

    await this.createAssistant();
  }

  async deinit() {
    await this.deleteFiles();
    await this.deleteVectorStore();
    await this.deleteAssistant();
  }

  reset() {
    this.threadContext = [];
  }

  private async uploadFile(filePath: string): Promise<OpenAI.Files.FileObject> {
    const absolutePath = path.resolve(process.cwd(), filePath);

    consola
      .withTag(this.assistant?.id ?? this.name ?? "")
      .debug(`Uploading file ${filePath}`);

    const retryCount = (await argv).retryCount as number;
    const retryMaxDelay = (await argv).retryMaxDelay as number;
    const file = await backOff(
      async () => {
        return await openai.files
          .create({
            file: fs.createReadStream(absolutePath),
            purpose: "assistants",
          })
          .then((result) => {
            consola.debug(
              `File ${filePath} uploaded and created with id ${result.id}`
            );
            return result;
          })
          .catch((error) => {
            consola.error(`Failed to upload file ${filePath}: ${error}`);
            throw error;
          });
      },
      {
        numOfAttempts: retryCount,
        maxDelay: retryMaxDelay,
        retry: (e, attempt) => {
          consola.error(
            `Failed to upload file after ${attempt} attempts: ${e}\nretrying...`
          );

          return true;
        },
      }
    );

    this.uploadedFiles.push(file);

    return file;
  }

  private async deleteFiles() {
    const deletePromises = this.uploadedFiles.map(async (file) => {
      const fileId = file.id;
      await openai.files.del(fileId).then((result) => {
        consola.debug(`File ${fileId} deleted`);
      });
    });

    await Promise.all(deletePromises);
  }

  private async createAssistant() {
    if (this.uploadedFiles.length === 0) {
      consola.warn("No files uploaded");
    }

    const vectorStore = await openai.beta.vectorStores.create({
      name: this.name,
      file_ids: this.uploadedFiles.map((file) => file.id),
    });
    consola
      .withTag(vectorStore.id)
      .debug(`Vector store ${vectorStore.id}: ${vectorStore.name} created`);
    consola.withTag(vectorStore.id).verbose(vectorStore);
    this.vectorStore = vectorStore;

    const retryCount = (await argv).retryCount as number;
    const retryMaxDelay = (await argv).retryMaxDelay as number;
    const assistant = await backOff(
      async () => {
        return await openai.beta.assistants.create({
          instructions: this.instructions,
          name: this.name,
          tools: [
            {
              type: "file_search",
              file_search: {
                max_num_results: 50, // this is the maximum number for gpt-4*
              },
            },
          ],
          tool_resources: {
            file_search: {
              vector_store_ids: [vectorStore.id],
            },
          },
          model: this.llmModel ?? (await argv).llmModel,
          temperature: this.temperature,
          top_p: this.topP,
        });
      },
      {
        numOfAttempts: retryCount,
        maxDelay: retryMaxDelay,
        retry: (e, attempt) => {
          consola.error(
            `Failed to create assistant after ${attempt} attempts: ${e}\nretrying...`
          );

          return true;
        },
      }
    );

    consola.withTag(assistant.id).debug(`Assistant ${assistant.id} created`);
    consola.withTag(assistant.id).verbose(assistant);
    this.assistant = assistant;

    await this.waitUntilVectorStoreReady();
  }

  private async deleteAssistant() {
    if (!this.assistant) {
      throw new Error("Assistant is not initialized");
    }

    const assistant_id = this.assistant.id;
    await openai.beta.assistants.del(assistant_id).then((result) => {
      consola.withTag(assistant_id).debug(`Assistant ${assistant_id} deleted`);
      this.assistant = undefined;
    });
  }

  private async waitUntilVectorStoreReady() {
    if (!this.vectorStore) {
      throw new Error("Vector store is not initialized");
    }

    let vectorStore = await openai.beta.vectorStores.retrieve(
      this.vectorStore.id
    );

    const bar = new SingleBar({
      format: `${this.vectorStore?.id} [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}`,
      stopOnComplete: true,
    });
    bar.start(vectorStore.file_counts.total, 0);
    while (vectorStore.file_counts.in_progress > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      vectorStore = await openai.beta.vectorStores.retrieve(
        this.vectorStore.id
      );
      bar.update(
        vectorStore.file_counts.total - vectorStore.file_counts.in_progress
      );
    }
    bar.stop(
      `${this.vectorStore?.id}: ${this.vectorStore?.name}: file processed`
    );
  }

  private async deleteVectorStore() {
    if (!this.vectorStore) {
      throw new Error("Vector store is not initialized");
    }

    const vectorStore_id = this.vectorStore.id;
    await openai.beta.vectorStores.del(vectorStore_id).then((result) => {
      consola
        .withTag(vectorStore_id)
        .debug(`Vector store ${vectorStore_id} deleted`);
      consola.withTag(vectorStore_id).verbose("Vector store delete", result);
      this.vectorStore = undefined;
    });
  }

  async runAssistant(
    messages: ThreadCreateParams.Message[]
  ): Promise<OpenAI.Beta.Threads.Messages.Message[]> {
    if (!this.assistant) {
      throw new Error("Assistant is not initialized");
    }

    const params: ThreadCreateParams = {
      messages: [
        ...this.threadContext.slice(-30),
        ...messages,
      ] as ThreadCreateParams.Message[],
    };
    consola.verbose(
      "Creating thread with messages: ",
      JSON.stringify(params, null, 2)
    );
    const thread = await openai.beta.threads.create({
      messages: params.messages,
    });
    consola
      .withTag([this.assistant?.id, thread.id].join(","))
      .debug("Thread created with id: ", thread.id);

    const spinnieName = thread.id;
    spinnies?.add(spinnieName, { text: `${thread.id}: start` });

    const model = this.llmModel ?? (await argv).llmModel;
    consola
      .withTag([this.assistant?.id, thread.id].join(","))
      .debug(`Using model: ${model}`);

    // TODO: Incompleteの時に再度テキスト生成をする
    let results: OpenAI.Beta.Threads.Messages.Message[] = [];
    for (let i = 0; i < RUN_REPEATE_COUNT; i++) {
      try {
        await this.streamAndWait(
          thread.id,
          {
            assistant_id: this.assistant.id,
            model: model,
            tool_choice: {
              type: "file_search",
            },
            response_format: {
              type: "text",
            },
          },
          spinnieName
        );
      } catch (error) {
        consola.withTag([this.assistant?.id, thread.id].join(",")).error(error);
        spinnies?.fail(spinnieName, { text: `${thread.id}: failed` });
        return [];
      }
      consola
        .withTag([this.assistant?.id, thread.id].join(","))
        .debug("Text generation stopped");

      // 全てのメッセージを取得する
      const runResult = await openai.beta.threads.messages.list(thread.id, {
        order: "asc",
      });
      consola
        .withTag([this.assistant?.id, thread.id].join(","))
        .debug(`Retrieved all messages from thread ${thread.id}`);
      consola
        .withTag([this.assistant?.id, thread.id].join(","))
        .verbose(runResult.data);
      const assistantMessages = runResult.data.filter(
        (message) => message.role === "assistant"
      );

      let runResultMessageContent: ThreadCreateParams.Message[] = [];
      runResult.data.forEach((resultMessageContent) => {
        if (resultMessageContent.content.length > 0) {
          const contents = resultMessageContent.content.map(
            (content): ThreadCreateParams.Message => {
              if (content.type === "text") {
                const message: ThreadCreateParams.Message = {
                  role: resultMessageContent.role,
                  content: content.text.value.toString(),
                };
                return message;
              } else {
                const message: ThreadCreateParams.Message = {
                  role: resultMessageContent.role,
                  content: JSON.stringify(content),
                };

                return message;
              }
            }
          );

          runResultMessageContent.push(...contents);
        }
      });

      this.threadContext = runResultMessageContent;
      results.push(...assistantMessages);

      if (assistantMessages.some((message) => message.incomplete_details)) {
        consola.withTag([this.assistant?.id, thread.id].join(",")).info(
          "Incomplete message detected. Reasons: ",
          assistantMessages
            .filter((message) => message.incomplete_details)
            .map((message) => message.incomplete_details?.reason)
        );
      } else {
        consola
          .withTag([this.assistant?.id, thread.id].join(","))
          .debug("No incomplete message detected. Finish thread");
        break;
      }
    }

    spinnies?.succeed(spinnieName, { text: `${thread.id}: finished` });

    return results;
  }

  async parseMessage<T>(at: number): Promise<T | undefined> {
    const message = this.threadContext
      .filter((message) => message.role === "assistant")
      .at(at);
    let text = "";
    try {
      if (message && message.content.length > 0) {
        text = message.content.toString();
        // extract json from text
        text = extractJSONString(text);

        return (await parseJSON(text)) as T;
      } else {
        consola
          .withTag(this.name.toString() ?? "")
          .warn(`Message is not text: ${message}`);
      }
    } catch (error) {
      consola.error(text);
      throw error;
    }
  }

  async streamAndWait(
    threadId: string,
    body: RunCreateParamsBaseStream,
    spinnieName?: string
  ): Promise<AssistantStream> {
    return new Promise((resolve, reject) => {
      const stream = openai.beta.threads.runs.stream(threadId, body);

      stream.on("textCreated", (text) => {
        // consola.withTag(threadId).verbose("assistant > ");
      });

      let snapshot_length = 0;
      stream.on("textDelta", (textDelta, snapshot) => {
        if (spinnieName && snapshot.value.length > snapshot_length + 30) {
          const status = `${threadId}: ${snapshot.value
            .slice(-60)
            .replace(/\s/g, " ")}`;
          spinnies?.update(spinnieName, { text: status });
          snapshot_length = snapshot.value.length;
        }
      });

      stream.on("messageDone", (message) => {
        consola.withTag(threadId).verbose("Message done", message);

        if (message.incomplete_at) {
          consola
            .withTag(threadId)
            .warn(
              `Message incomplete due to ${message.incomplete_details?.reason}`
            );
        }
      });

      stream.on("toolCallCreated", (toolCall) => {
        consola.withTag(threadId).verbose(`assistant > ${toolCall.type}`);
        if (spinnieName) {
          spinnies?.update(spinnieName, {
            text: `${threadId}: ${toolCall.type}`,
          });
        }
      });

      stream.on("runStepDone", (runStepDelta, snapshot) => {
        consola.withTag(threadId).verbose(runStepDelta, snapshot);
        if (snapshot.status === "failed") {
          reject(
            new Error(
              `${snapshot.last_error?.code}: ${snapshot.last_error?.message}`
            )
          );
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
}
