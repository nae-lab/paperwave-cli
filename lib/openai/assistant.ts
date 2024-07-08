import fs from "fs";
import path from "path";
import process from "process";
import OpenAI from "openai";
import { ThreadCreateParams } from "openai/resources/beta/index";
import {
  AssistantStream,
  RunCreateParamsBaseStream,
} from "openai/lib/AssistantStream";
import { randomUUID } from "crypto";

import { openai } from "../openai";
import { consola, runId } from "../logging";
import { spinnies } from "../spinnies";
import { argv } from "../args";

export class FileSearchAssistant {
  assistant?: OpenAI.Beta.Assistants.Assistant;
  readonly name: string;
  filePaths: string[] = [];
  uploadedFiles: OpenAI.Files.FileObject[] = [];
  instructions: string;
  temperature?: number;
  topP?: number;

  constructor(
    filePaths: string[],
    instructions: string,
    name?: string,
    temperature?: number,
    topP?: number
  ) {
    this.name = name ?? `file_search_${runId}_${randomUUID()}`;
    this.filePaths = filePaths;
    this.instructions = instructions;
    this.temperature = temperature;
    this.topP = topP;
  }

  async init() {
    const uploadPromises = this.filePaths.map(async (filePath) => {
      spinnies.add(filePath, { text: `Uploading ${filePath}` });
      const uploadedFile = await this.uploadFile(filePath);
      spinnies.succeed(filePath, {
        text: `Uploaded ${filePath} as ${uploadedFile.id}`,
      });
    });
    await Promise.all(uploadPromises);

    await this.createAssistant();
  }

  async deinit() {
    await this.deleteAssistant();
    await this.deleteFiles();
  }

  private async uploadFile(filePath: string): Promise<OpenAI.Files.FileObject> {
    const absolutePath = path.resolve(process.cwd(), filePath);
    const file = await openai.files
      .create({
        file: fs.createReadStream(absolutePath),
        purpose: "assistants",
      })
      .then((result) => {
        consola.debug(
          `File ${filePath} uploaded and created with id ${result.id}`
        );
        return result;
      });

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
    const assistant = await openai.beta.assistants.create({
      instructions: this.instructions,
      name: this.name,
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: {
          vector_stores: [
            {
              file_ids: this.uploadedFiles.map((file) => file.id),
            },
          ],
        },
      },
      model: (await argv).gptModel,
      temperature: this.temperature,
      top_p: this.topP,
    });
    consola.debug(`Assistant ${assistant.id} created`);
    consola.verbose(assistant);
    this.assistant = assistant;
  }

  private async deleteAssistant() {
    if (!this.assistant) {
      throw new Error("Assistant is not initialized");
    }

    const assistant_id = this.assistant.id;
    await openai.beta.assistants.del(assistant_id).then((result) => {
      consola.debug(`Assistant ${assistant_id} deleted`);
      this.assistant = undefined;
    });
  }

  async runAssistant(messages: ThreadCreateParams.Message[]) {
    if (!this.assistant) {
      throw new Error("Assistant is not initialized");
    }

    const thread = await openai.beta.threads.create({
      messages: messages,
    });
    consola.withTag(thread.id).debug("Thread created");

    const spinnieName = thread.id;
    spinnies.add(spinnieName, { text: `${thread.id}: start` });

    const model = (await argv).gptModel;
    consola.debug(`Using model: ${model}`);

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
      consola.withTag(thread.id).error(error);
      spinnies.fail(spinnieName, { text: `${thread.id}: failed` });
      return [];
    }

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

  async streamAndWait(
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
          spinnies.update(spinnieName, {
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
