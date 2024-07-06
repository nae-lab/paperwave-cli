import { argv } from "./lib/args";
import { consola, str2logLevel } from "./lib/consola";
import { LogLevel } from "consola";
import { runAssistant } from "./lib/openai";
import { spinnies } from "./lib/spinnies";

async function main() {
  // Set log level to passed in artgument (--log)
  consola.level = str2logLevel((await argv).log as string) as LogLevel;

  consola.start("Start running assistant...");
  const as1 = await runAssistant("asst_ZDACE7vUVXkdOHSX0Nck5dkX", [
    {
      role: "user",
      content: "DIYの意義",
    },
  ]);
  const as2 = await runAssistant("asst_cZAKM9kqe99mEtACH23bQnNZ", [
    {
      role: "user",
      content: "方法",
    },
  ]);

  const results = await Promise.all([as1, as2]);
  consola.success("Assistant run completed!");

  consola.info("Results:", results);
  results.forEach((result) => {
    result.forEach((message) => {
      consola.info(message.content);
    });
  });
}

main();
