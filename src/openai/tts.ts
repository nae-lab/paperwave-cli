import * as fs from "fs-extra";
import { Type, type Static } from "@sinclair/typebox";

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

  const response = await openai.audio.speech.create(requestOptions);

  consola.verbose("Received TTS response", response);

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filename, audioBuffer);
}
