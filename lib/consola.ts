import { createConsola, LogLevel } from "consola";

export const consola = createConsola({
  formatOptions: {
    colors: true,
  },
});

export function str2logLevel(level: string): LogLevel {
  switch (level) {
    case "trace":
      return 5;
    case "debug":
      return 4;
    case "info":
      return 3;
    case "normal":
      return 2;
    case "warn":
      return 1;
    case "error":
    case "fatal":
      return 0;
    case "silent":
      return -999;
    case "verbose":
      return 999;
    default:
      return 3;
  }
}

consola.wrapConsole();
