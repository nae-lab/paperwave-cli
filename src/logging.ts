import process from "process";
import { exec as _exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import appRootPath from "app-root-path";
import sanitize from "sanitize-filename";

import { createConsola, LogLevels, LogType, ConsolaReporter } from "consola";

import { argv } from "./args";

const exec = util.promisify(_exec);

// Create a logs directory if it doesn't exist
const logDir = path.join(appRootPath.path, process.env.LOG_DIR || "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create a log directory for each run. Directory name is the current timestamp in local timezone.
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
const hostname = os.hostname();
const runIdUnsanitized = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}${timezoneSign}${timezoneHours}-${timezoneMinutes}-${hostname}`;
export const runId = sanitize(runIdUnsanitized).replace(".", "_").replace(/\s/g, "_").slice(0, 120); // export for use in other files to store log files
export const runLogDir = path.join(logDir, runId); // export for use in other files to store log files
fs.mkdirSync(runLogDir);

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

setupConsola();
logCodeSnapshot();
