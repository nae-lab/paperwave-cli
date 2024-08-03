import dotenv from "dotenv";
dotenv.config({
  override: true,
});

import PromisePool from "@supercharge/promise-pool";
import { openai } from "../src/openai";
import { consola } from "../src/logging";
import { ASSISTANT_NAME_PREFIX } from "../src/openai/assistant";
import { argv } from "../src/args";
import { error } from "console";

let forceClean = false;

async function cleanAssistants() {
  let assistants = await openai.beta.assistants.list({
    limit: 100,
  });

  let skippedCount = 0;

  while (assistants.data.length - skippedCount > 0) {
    const { results, errors } = await PromisePool.withConcurrency(30)
      .for(assistants.data)
      .process(async (assistant) => {
        if (forceClean || assistant.name?.startsWith(ASSISTANT_NAME_PREFIX)) {
          consola.info(`Deleting assistant ${assistant.id}: ${assistant.name}`);
          const response = await openai.beta.assistants.del(assistant.id);
          consola.debug(`Assistant ${assistant.id}: ${assistant.name} deleted`);
          consola.verbose(response);
        } else {
          consola.info(`Skipping assistant ${assistant.id}: ${assistant.name}`);
          skippedCount++;
        }
      });

    if (errors.length > 0) {
      errors.forEach((err) => {
        consola.error(err);
      });

      throw new Error("Errors occurred while deleting assistants");
    }

    assistants = await openai.beta.assistants.list({
      limit: 100,
    });
    consola.debug(`Assistants left: ${assistants.data.length - skippedCount}`);
  }
}

async function cleanVectorStores() {
  let vectorStores = await openai.beta.vectorStores.list({
    limit: 100,
  });

  let skippedCount = 0;

  while (vectorStores.data.length - skippedCount > 0) {
    const { results, errors } = await PromisePool.withConcurrency(30)
      .for(vectorStores.data)
      .process(async (vectorStore) => {
        if (forceClean || vectorStore.name?.startsWith(ASSISTANT_NAME_PREFIX)) {
          consola.info(
            `Deleting vector store ${vectorStore.id}: ${vectorStore.name}`
          );

          await cleanVectorStoreFiles(vectorStore.id);

          const response = await openai.beta.vectorStores.del(vectorStore.id);

          consola.debug(
            `Vector store ${vectorStore.id}: ${vectorStore.name} deleted`
          );
          consola.verbose(response);
        } else {
          consola.info(
            `Skipping vector store ${vectorStore.id}: ${vectorStore.name}`
          );
          skippedCount++;
        }
      });

    if (errors.length > 0) {
      errors.forEach((err) => {
        consola.error(err);
      });

      throw new Error("Errors occurred while deleting vector stores");
    }

    vectorStores = await openai.beta.vectorStores.list({
      limit: 100,
    });
    consola.debug(
      `Vector stores left: ${vectorStores.data.length - skippedCount}`
    );
  }
}

async function cleanVectorStoreFiles(vectorStoreID: string) {
  const files = await openai.beta.vectorStores.files.list(vectorStoreID);

  for (const file of files.data) {
    const fileInfo = await openai.files.retrieve(file.id);
    consola.info(`Deleting file ${file.id} ${fileInfo.filename}`);

    const responseVectorStoreFileDel = await openai.beta.vectorStores.files.del(
      vectorStoreID,
      file.id
    );
    consola.debug(`File ${file.id} deleted from vector store ${vectorStoreID}`);
    consola.verbose(responseVectorStoreFileDel);

    const responseFileDel = await openai.files.del(file.id);
    consola.debug(`File ${file.id}: ${fileInfo.filename} deleted`);
    consola.verbose(responseFileDel);
  }
}

async function main() {
  forceClean = (await argv).forceClean;

  await cleanVectorStores();
  await cleanAssistants();
}

main();
