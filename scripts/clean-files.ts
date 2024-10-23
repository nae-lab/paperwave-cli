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
 * Description: This script deletes all files on OpenAI.
 */

import dotenv from "dotenv";
dotenv.config({
  override: true,
});

import PromisePool from "@supercharge/promise-pool";
import { openai } from "../src/openai";
import { consola } from "../src/logging";

async function cleanFiles() {
  const files = await openai.files.list({
    purpose: "assistants",
  });

  for (const file of files.data) {
    const fileInfo = await openai.files.retrieve(file.id);

    consola.info(`Deleting file ${file.id} ${fileInfo.filename}`);

    const responseFileDel = await openai.files.del(file.id);
    consola.debug(`File ${file.id}: ${fileInfo.filename} deleted`);
    consola.verbose(responseFileDel);
  }

  const { errors } = await PromisePool.withConcurrency(30)
    .for(files.data)
    .process(async (file) => {
      consola.info(`Deleting file ${file.id}: ${file.filename}`);

      const response = await openai.files.del(file.id);
      consola.debug(`File ${file.id}: ${file.filename} deleted`);
      consola.verbose(response);
    });

  errors.forEach((err) => {
    consola.error(err);
  });
}

async function main() {
  await cleanFiles();
}

main();
