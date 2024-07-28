import PromisePool from "@supercharge/promise-pool";
import { openai } from "../src/openai";
import { consola } from "../src/logging";
import { ASSISTANT_NAME_PREFIX } from "../src/openai/assistant";

async function cleanAssistants() {
  let assistants = await openai.beta.assistants.list({
    limit: 100,
  });

  while (assistants.data.length !== 0) {
    await PromisePool.withConcurrency(30)
      .for(assistants.data)
      .process(async (assistant) => {
        if (assistant.name?.startsWith(ASSISTANT_NAME_PREFIX)) {
          consola.info(`Deleting assistant ${assistant.id}: ${assistant.name}`);
          const response = await openai.beta.assistants.del(assistant.id);
          consola.debug(`Assistant ${assistant.id}: ${assistant.name} deleted`);
          consola.verbose(response);
        } else {
          consola.info(`Skipping assistant ${assistant.id}: ${assistant.name}`);
        }
      });

    assistants = await openai.beta.assistants.list({
      limit: 100,
    });
  }
}

async function cleanVectorStores() {
  let vectorStores = await openai.beta.vectorStores.list({
    limit: 100,
  });

  while (vectorStores.data.length !== 0) {
    await PromisePool.withConcurrency(30)
      .for(vectorStores.data)
      .process(async (vectorStore) => {
        if (vectorStore.name?.startsWith(ASSISTANT_NAME_PREFIX)) {
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
        }
      });

    vectorStores = await openai.beta.vectorStores.list({
      limit: 100,
    });
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
  await cleanVectorStores();
  await cleanAssistants();
}

main();
