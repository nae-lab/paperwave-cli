import dotenv from "dotenv";
dotenv.config({
  override: true,
});

import PromisePool from "@supercharge/promise-pool";
import { openai } from "../src/openai";
import { consola } from "../src/logging";

async function cleanFiles() {
  const files = await openai.files.list({
    purpose: "assistants",
  });

  for (const file of files.data) {
    const fileInfo = await openai.files.retrieve(file.id);

    consola.info(`Deleting file ${file.id} ${fileInfo.filename}`);

    const responseFileDel = await openai.files.del(file.id);
    consola.debug(`File ${file.id}: ${fileInfo.filename} deleted`);
    consola.verbose(responseFileDel);
  }

  const { errors } = await PromisePool.withConcurrency(30)
    .for(files.data)
    .process(async (file) => {
      consola.info(`Deleting file ${file.id}: ${file.filename}`);

      const response = await openai.files.del(file.id);
      consola.debug(`File ${file.id}: ${file.filename} deleted`);
      consola.verbose(response);
    });

  errors.forEach((err) => {
    consola.error(err);
  });
}

async function main() {
  await cleanFiles();
}

main();
