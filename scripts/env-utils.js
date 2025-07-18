#!/usr/bin/env node

const dotenv = require("dotenv");
const result = dotenv.config();

if (result.error) {
  console.error("Error loading .env file:", result.error.message);
  process.exit(1);
}

const envOnly = result.parsed || {};

const command = process.argv[2];

switch (command) {
  case "json":
    console.log(JSON.stringify(envOnly, null, 2));
    break;
  case "export":
    Object.entries(envOnly).forEach(([key, value]) => {
      console.log(`export ${key}="${value}"`);
    });
    break;
  case "debug":
    console.log("Environment variables loaded from .env:");
    Object.entries(envOnly).forEach(([key, value]) => {
      // 機密情報をマスク
      const maskedValue = key.match(/KEY|TOKEN|PASSWORD/)
        ? value.replace(/./g, "*")
        : value;
      console.log(`  ${key}=${maskedValue}`);
    });
    console.log(`Total: ${Object.keys(envOnly).length} variables`);
    break;
  default:
    console.log("Usage: node env-utils.js [json|export|debug]");
    process.exit(1);
}
