import { LogLevels } from "consola";
import process from "process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export const argv = yargs(hideBin(process.argv))
  .options({
    log: {
      alias: "l",
      type: "string",
      default: "info",
      choices: Object.keys(LogLevels) as string[],
    },
    "gpt-model": {
      alias: "m",
      type: "string",
      default: "gpt-4o",
      choices: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    papers: {
      alias: "p",
      type: "array",
      default: [],
    },
  })
  .parse();
