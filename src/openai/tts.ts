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
    description: "Text to Speechの音声の種類",
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
  const response = await backOff(
    async () => {
      return await openai.audio.speech.create(requestOptions);
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

  consola.verbose("Received TTS response", response);

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filename, audioBuffer);
}
