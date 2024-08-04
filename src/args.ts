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
    "retry-count": {
      type: "number",
      default: 10,
    },
    "retry-max-delay": {
      type: "number",
      default: 150000,
    },
    "gpt-model": {
      alias: "g",
      type: "string",
      default: "gpt-4o",
      choices: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    "chat-concurrency": {
      type: "number",
      default: 1,
    },
    "assistant-concurrency": {
      type: "number",
      default: 1,
    },
    "tts-model": {
      alias: "t",
      type: "string",
      default: "tts-1",
      choices: ["tts-1", "tts-1-hd"],
    },
    "tts-concurrency": {
      type: "number",
      default: 1,
    },
    papers: {
      alias: "p",
      type: "array",
      default: [],
    },
    minute: {
      alias: "m",
      type: "number",
    },
    bgm: {
      alias: "b",
      type: "string",
    },
    "bgm-volume": {
      type: "number",
      default: 0.1,
    },
    "force-clean": {
      type: "boolean",
      default: false,
    },
  })
  .parse();
