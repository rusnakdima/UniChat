export const environment = {
  production: false,
  logging: {
    enabled: true,
    minLevel: "debug",
    consoleOutput: true,
    memoryOutput: true,
    fileOutput: false,
    fileLogLevel: "error",
    levels: { debug: true, info: true, warn: true, error: true, success: true },
  },
};
