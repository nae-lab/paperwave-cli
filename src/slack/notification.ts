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
 * Description: Slack notification utilities for error reporting
 */

import { WebClient } from "@slack/web-api";
import { consola } from "../logging";

const CHANNEL_ID = process.env.SLACK_ALERT_CHANNEL_ID || "";

let slackClient: WebClient | null = null;

function getSlackClient(): WebClient | null {
  const token = process.env.SLACK_TOKEN;

  if (!token) {
    consola.warn(
      "SLACK_TOKEN environment variable is not set. Slack notifications will be disabled."
    );
    return null;
  }

  if (!slackClient) {
    slackClient = new WebClient(token);
  }

  return slackClient;
}

export async function sendRetryNotification(
  operation: string,
  error: Error,
  attempt: number
): Promise<void> {
  const client = getSlackClient();

  if (!client) {
    consola.debug("Slack client not available, skipping notification");
    return;
  }

  try {
    const message = {
      channel: CHANNEL_ID,
      text: `📢 リトライ通知 - ${operation}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔄 *リトライ実行 - ${operation}*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*リトライ回数:*\n${attempt}回目`,
            },
            {
              type: "mrkdwn",
              text: `*エラーコード:*\n${(error as any).code || "N/A"}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*エラーメッセージ:*\n\`\`\`${error.message}\`\`\``,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 ${new Date().toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}`,
            },
          ],
        },
      ],
    };

    await client.chat.postMessage(message);
    consola.debug(`Slack notification sent for retry of ${operation}`);
  } catch (slackError) {
    consola.error("Failed to send Slack notification:", slackError);
  }
}

export async function sendFinalFailureNotification(
  operation: string,
  error: Error,
  totalAttempts: number
): Promise<void> {
  const client = getSlackClient();

  if (!client) {
    consola.debug("Slack client not available, skipping notification");
    return;
  }

  try {
    const message = {
      channel: CHANNEL_ID,
      text: `🚨 処理失敗 - ${operation}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *処理失敗 - ${operation}*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*総リトライ回数:*\n${totalAttempts}回`,
            },
            {
              type: "mrkdwn",
              text: `*エラーコード:*\n${(error as any).code || "N/A"}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*最終エラーメッセージ:*\n\`\`\`${error.message}\`\`\``,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 ${new Date().toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}`,
            },
          ],
        },
      ],
    };

    await client.chat.postMessage(message);
    consola.debug(`Slack final failure notification sent for ${operation}`);
  } catch (slackError) {
    consola.error(
      "Failed to send Slack final failure notification:",
      slackError
    );
  }
}
