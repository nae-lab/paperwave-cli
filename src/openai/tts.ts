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
 * Description: Text to Speech using OpenAIAPI.
 */

import * as fs from "fs-extra";
import { Type, type Static } from "@sinclair/typebox";
import { backOff } from "exponential-backoff";

import { openai } from "../openai";
import { consola } from "../logging";
import { argv } from "../args";
import { SpeechCreateParams } from "openai/resources/audio/speech";

export const VoiceOptionsSchema = Type.Union(
  [
    Type.Literal("alloy"),
    Type.Literal("echo"),
    Type.Literal("fable"),
    Type.Literal("onyx"),
    Type.Literal("nova"),
    Type.Literal("shimmer"),
  ],
  {
    description: "The voice to use for the TTS",
  }
);

export type VoiceOptions = Static<typeof VoiceOptionsSchema>;

export async function synthesizeSpeech(
  text: string,
  voiceName: VoiceOptions,
  filename: string
) {
  const model = ((await argv).ttsModel as string) || "tts-1";
  const requestOptions: SpeechCreateParams = {
    model: model,
    input: text,
    voice: voiceName,
    response_format: "wav",
  };
  consola.verbose("Requesting TTS from OpenAI", requestOptions);

  const retryCount = (await argv).retryCount as number;
  const retryMaxDelay = (await argv).retryMaxDelay as number;
  await backOff(
    async () => {
      const response = await openai.audio.speech.create(requestOptions);

      consola.verbose("Received TTS response", response);

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filename, audioBuffer);
    },
    {
      numOfAttempts: retryCount,
      maxDelay: retryMaxDelay,
      retry: (e, attempt) => {
        consola.debug(
          `Failed to synthesize speech after ${attempt} attempts: ${e}`
        );

        if (e.type === "requests" && (e.status === 429 || e.status >= 500)) {
          consola.debug("Retrying due to HTTP error", e);
          return true;
        }

        consola.debug("Not retrying: ", e);
        return false;
      },
    }
  );

}
