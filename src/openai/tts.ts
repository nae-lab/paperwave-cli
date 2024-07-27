import * as fs from "fs-extra";
import { Type, type Static } from "@sinclair/typebox";

import { openai } from "../openai";
import { argv } from "../args";

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
  const model = (await argv).ttsModel ?? "tts-1";
  const response = await openai.audio.speech.create({
    model: model,
    input: text,
    voice: voiceName,
    response_format: "wav",
  });
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filename, audioBuffer);
}
