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

/**
 * エラーから詳細情報を抽出するヘルパー関数
 * ネストしたエラーメッセージやスタックトレースも含める
 */
function extractErrorDetails(error: Error): {
  message: string;
  details: string;
  stack?: string;
} {
  const messages: string[] = [];
  const details: string[] = [];
  
  // 現在のエラーメッセージを追加
  if (error.message) {
    messages.push(error.message);
  }
  
  // エラーコードやタイプなどの詳細情報を収集
  const errorObj = error as any;
  if (errorObj.code) {
    details.push(`Code: ${errorObj.code}`);
  }
  if (errorObj.type) {
    details.push(`Type: ${errorObj.type}`);
  }
  if (errorObj.status) {
    details.push(`Status: ${errorObj.status}`);
  }
  if (errorObj.statusText) {
    details.push(`Status Text: ${errorObj.statusText}`);
  }
  
  // OpenAI API特有のエラー情報を抽出
  if (errorObj.error) {
    if (typeof errorObj.error === 'string') {
      messages.push(errorObj.error);
    } else if (typeof errorObj.error === 'object') {
      if (errorObj.error.message) {
        messages.push(errorObj.error.message);
      }
      if (errorObj.error.code) {
        details.push(`Error Code: ${errorObj.error.code}`);
      }
      if (errorObj.error.type) {
        details.push(`Error Type: ${errorObj.error.type}`);
      }
    }
  }
  
  // 原因となったエラーを再帰的に処理 (error.cause)
  let currentError = error as any;
  let depth = 0;
  const maxDepth = 5; // 無限ループを防ぐ
  
  while (currentError.cause && depth < maxDepth) {
    depth++;
    const cause = currentError.cause as any;
    if (cause.message) {
      messages.push(`└─ Caused by: ${cause.message}`);
    }
    
    if (cause.code) {
      details.push(`Cause Code: ${cause.code}`);
    }
    if (cause.status) {
      details.push(`Cause Status: ${cause.status}`);
    }
    
    currentError = cause;
  }
  
  // 複数のエラーメッセージを結合
  const combinedMessage = messages.join('\n');
  const combinedDetails = details.join(', ');
  
  return {
    message: combinedMessage || error.toString(),
    details: combinedDetails,
    stack: error.stack,
  };
}

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
    const errorDetails = extractErrorDetails(error);

    const blocks = [
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
            text: `*エラー詳細:*\n${errorDetails.details || "N/A"}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*エラーメッセージ:*\n\`\`\`${errorDetails.message}\`\`\``,
        },
      },
    ];

    // スタックトレースがある場合は追加（長すぎる場合は省略）
    if (errorDetails.stack) {
      const truncatedStack =
        errorDetails.stack.length > 1000
          ? errorDetails.stack.substring(0, 1000) + "...(truncated)"
          : errorDetails.stack;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*スタックトレース:*\n\`\`\`${truncatedStack}\`\`\``,
        },
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📅 ${new Date().toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })}`,
        },
      ],
    } as any);

    const message = {
      channel: CHANNEL_ID,
      text: `📢 リトライ通知 - ${operation}`,
      blocks,
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
    const errorDetails = extractErrorDetails(error);

    const blocks = [
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
            text: `*エラー詳細:*\n${errorDetails.details || "N/A"}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*最終エラーメッセージ:*\n\`\`\`${errorDetails.message}\`\`\``,
        },
      },
    ];

    // スタックトレースがある場合は追加（長すぎる場合は省略）
    if (errorDetails.stack) {
      const truncatedStack =
        errorDetails.stack.length > 1000
          ? errorDetails.stack.substring(0, 1000) + "...(truncated)"
          : errorDetails.stack;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*スタックトレース:*\n\`\`\`${truncatedStack}\`\`\``,
        },
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📅 ${new Date().toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })}`,
        },
      ],
    } as any);

    const message = {
      channel: CHANNEL_ID,
      text: `🚨 処理失敗 - ${operation}`,
      blocks,
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
