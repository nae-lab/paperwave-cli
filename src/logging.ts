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
 * Description: Utility functions for logging.
 */

import process from "process";
import { exec as _exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import appRootPath from "app-root-path";
import sanitize from "sanitize-filename";
import * as admin from "firebase-admin";
import { db, bucket } from "./firebase";

import { createConsola, LogLevels, LogType, ConsolaReporter } from "consola";

import { argv } from "./args";
import { log } from "console";

const exec = util.promisify(_exec);

// Create a logs directory if it doesn't exist
const logDir = path.join(appRootPath.path, process.env.LOG_DIR || "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create a log directory for each run. Directory name is the current timestamp in local timezone.
const hostname = os.hostname();
const timestamp = generateTimestampInLocalTimezone();
const runIdUnsanitized = `${timestamp}-${hostname}`;
export const runId = sanitize(runIdUnsanitized)
  .replace(".", "_")
  .replace(/\s/g, "_")
  .slice(0, 120); // export for use in other files to store log files
export const runLogDir = path.join(logDir, runId); // export for use in other files to store log files
fs.mkdirSync(runLogDir);

export function generateTimestampInLocalTimezone() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timezoneOffset = now.getTimezoneOffset();
  const timezoneHours = Math.abs(Math.floor(timezoneOffset / 60))
    .toString()
    .padStart(2, "0");
  const timezoneMinutes = (Math.abs(timezoneOffset) % 60)
    .toString()
    .padStart(2, "0");
  const timezoneSign = timezoneOffset < 0 ? "+" : "-";
  const timestampInLocalTimezone = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}${timezoneSign}${timezoneHours}-${timezoneMinutes}`;

  return timestampInLocalTimezone;
}

async function logCodeSnapshot() {
  // Log current git commit hash
  const gitShowResult = await exec("git show --no-patch");
  const gitShow = gitShowResult.stdout;
  fs.writeFileSync(path.join(runLogDir, "git_show.txt"), gitShow);

  // Save code snapshot to the runLogDir using git
  await exec("git add -N --all");
  const gitStatusResult = await exec("git status -vv");
  const gitStatus = gitStatusResult.stdout;
  fs.writeFileSync(path.join(runLogDir, "git_status.txt"), gitStatus);

  // Save main.ts to the runLogDir
  const mainTsPath = path.join(appRootPath.path, "src/main.ts");
  const mainTs = fs.readFileSync(mainTsPath);
  fs.writeFileSync(path.join(runLogDir, "main.ts"), mainTs);
}

// Log to file reporter
const logFileReporter: ConsolaReporter = {
  log: (logObj) => {
    const logFile = `${runLogDir}/${runId}.log`;
    const jvLogObj = {
      ...logObj,
      timestamp: new Date(logObj.date).toLocaleString(),
      level: logObj.type,
      // make the human readable message from the args object
      message: logObj.args
        .map((arg) => {
          if (typeof arg === "string") {
            return arg;
          }
          if (arg instanceof Error) {
            return arg.stack;
          }
          return JSON.stringify(arg);
        })
        .join(" ")
        .slice(0, 80),
    };
    fs.appendFileSync(logFile, JSON.stringify(jvLogObj) + "\n");

    // Log to console if the log level is smaller than specified in the args
    if (logObj.level <= consoleConsola.level) {
      consoleConsola._log(logObj);
    }
  },
};

// Create a consola instances
// Main logger used throughout the application that collects all logs
export const consola = createConsola({
  formatOptions: {
    colors: true,
  },
  reporters: [logFileReporter],
  level: LogLevels.verbose,
});

// Logger writes to console with custom log level
const consoleConsola = createConsola({
  formatOptions: {
    colors: true,
  },
});

async function setupConsola() {
  consola.wrapConsole();
  consoleConsola.level = LogLevels[(await argv).log as LogType];
  // Log the runId
  consola.info(`Run ID: ${runId}`);
  consola.debug("Consola setup complete");

  // Log the executed command
  const command = process.argv.join(" ");
  consola.debug(`Command: ${command}`);
}

export function getLogs() {
  const logFile = `${runLogDir}/${runId}.log`;
  // ログファイルを読み取る
  const logFileContent = fs.readFileSync(logFile, "utf8");
  const logLines = logFileContent.split("\n");

  return logLines;
}

setupConsola();
logCodeSnapshot();
