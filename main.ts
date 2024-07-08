import { argv } from "./lib/args";
import { consola } from "./lib/logging";
import { FileSearchAssistant } from "./lib/openai/assistant";

async function main() {
  const filePaths = (await argv).papers as string[];
  const assistant = new FileSearchAssistant(filePaths, "Search for papers");

  const fileIds = await assistant.init();

  consola.info(`Assistant initialized with files: ${fileIds}`);

  // await assistant.deinit();
}

main();
