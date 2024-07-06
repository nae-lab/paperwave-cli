import process from "process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export const argv = yargs(hideBin(process.argv))
  .options({
    log: { type: "string", default: "info" },
  })
  .parse();
