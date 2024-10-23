/*
 * Copyright 2024 Naemura Laboratory, the University of Tokyo
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Description: Define the command line arguments.
 */

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
    "llm-model": {
      alias: "g",
      type: "string",
      default: "gpt-4o",
      choices: [
        "gpt-4o",
        "gpt-4o-2024-08-06",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
      ],
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
    language: {
      type: "string",
      default: "en",
      choices: ["en", "ja", "ko"],
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
