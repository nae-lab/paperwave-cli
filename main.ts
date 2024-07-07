import { argv } from "./lib/args";
import { consola } from "./lib/logging";
import { LogLevel } from "consola";
import { runAssistant } from "./lib/openai";

async function main() {
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
