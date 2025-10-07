/*
 * Copyright 2025 Naemura Laboratory, the University of Tokyo
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
 * Description: Check recording failure rate in episodes-production collection.
 */

import dotenv from "dotenv";
dotenv.config({
  override: true,
});

import { db } from "../src/firebase";
import { consola } from "../src/logging";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Timestamp } from "firebase-admin/firestore";

interface EpisodeData {
  isRecordingCompleted?: boolean;
  isRecordingFailed?: boolean;
  createdAt?: Timestamp;
  [key: string]: any;
}

async function checkRecordingFailureRate(sinceDate?: Date) {
  const episodesRef = db.collection("episodes-production");

  let query: FirebaseFirestore.Query = episodesRef;

  if (sinceDate) {
    const sinceTimestamp = Timestamp.fromDate(sinceDate);
    consola.info(`Fetching episodes since ${sinceDate.toISOString()}...`);
    query = query.where("createdAt", ">=", sinceTimestamp);
  } else {
    consola.info("Fetching all episodes from episodes-production collection...");
  }

  const allSnapshot = await query.get();

  if (allSnapshot.empty) {
    consola.warn("No episodes found in episodes-production collection.");
    return;
  }

  let completedCount = 0;
  let failedCount = 0;
  let otherCount = 0;

  allSnapshot.forEach((doc) => {
    const data = doc.data() as EpisodeData;

    if (data.isRecordingCompleted === true) {
      completedCount++;
    } else if (data.isRecordingFailed === true) {
      failedCount++;
    } else {
      otherCount++;
    }
  });

  const total = completedCount + failedCount;
  const failureRate = total > 0 ? (failedCount / total) * 100 : 0;
  const successRate = total > 0 ? (completedCount / total) * 100 : 0;

  consola.info("\n=== Recording Failure Rate Report ===");
  if (sinceDate) {
    consola.info(`Period: Since ${sinceDate.toISOString()}`);
  } else {
    consola.info(`Period: All time`);
  }
  consola.info(`Total episodes: ${allSnapshot.size}`);
  consola.info(`\nRecording Status:`);
  consola.info(`  - isRecordingCompleted=true: ${completedCount} (${successRate.toFixed(2)}%)`);
  consola.info(`  - isRecordingFailed=true:    ${failedCount} (${failureRate.toFixed(2)}%)`);
  consola.info(`  - Other status:              ${otherCount}`);
  consola.info(`\nTotal (Completed + Failed): ${total}`);
  consola.info(`Failure Rate: ${failureRate.toFixed(2)}%`);
  consola.info(`Success Rate: ${successRate.toFixed(2)}%`);
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .options({
      since: {
        type: "string",
        description: "Filter episodes created since this date (ISO 8601 format, e.g., 2025-08-01)",
        alias: "s",
      },
    })
    .example("$0", "Check all episodes")
    .example("$0 --since 2025-08-01", "Check episodes since August 1, 2025")
    .help()
    .parse();

  let sinceDate: Date | undefined;

  if (argv.since) {
    sinceDate = new Date(argv.since);
    if (isNaN(sinceDate.getTime())) {
      consola.error(`Invalid date format: ${argv.since}`);
      consola.info("Please use ISO 8601 format (e.g., 2025-08-01 or 2025-08-01T00:00:00Z)");
      process.exit(1);
    }
  }

  try {
    await checkRecordingFailureRate(sinceDate);
  } catch (error) {
    consola.error("Error checking recording failure rate:", error);
    process.exit(1);
  }
}

main();
