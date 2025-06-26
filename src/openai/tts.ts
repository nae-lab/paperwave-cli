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

import { azureTTS } from "../openai";
import { consola } from "../logging";
import { argv } from "../args";
import { SpeechCreateParams } from "openai/resources/audio/speech";

export const VoiceOptionsSchema = Type.Union(
  [
    // Type.Literal("alloy"),
    // Type.Literal("echo"),
    // Type.Literal("fable"),
    // Type.Literal("onyx"),
    // // Type.Literal("nova"),
    // Type.Literal("shimmer"),
    Type.Literal("sage"),
    Type.Literal("ash"),
    // Type.Literal("coral"),
    Type.Literal("ballad"),
    Type.Literal("verse"),
  ],
  {
    description: "The voice to use for the TTS",
  }
);

export type VoiceOptions = Static<typeof VoiceOptionsSchema>;

export async function synthesizeSpeech(
  text: string,
  voiceName: VoiceOptions,
  filename: string,
  previousTurnText?: string
) {
  const model = ((await argv).ttsModel as string) || "tts-1";

  // 基本のinstructions
  const baseInstructions = `
役割 (Role):
ある特定のテーマについて深く思索し、自身の考えを整理しながら語る専門家または考察者。

態度 (Demeanor):
穏やかで内省的。話すトピックに集中しており、聞き手に知識をひけらかすのではなく、思考のプロセスを共有するような態度。

トーン (Tone):
説明的で、全体的に抑揚がフラットな落ち着いたトーン。感情的な高ぶりや過度な興奮は避ける。

ペースとリズム (Pacing & Rhythm):
全体的には早口だが、ペースは一定ではない。思考がまとまっている部分は流暢に速く、考えを探している部分では自然とペースが落ちる、非線形なリズムで話す。

音量とピッチ (Volume & Pitch):
ナレーション全体を通して、一貫した声量と中低域のピッチを維持する。強調のためにピッチを変化させるのではなく、単語の発音時間を少し長くすることで重要性を示す。

発音と特徴 (Diction & Quirks):
・滑舌：完璧に明瞭ではなく、少しこもった（muffled）ような自然で洗練されていない発音。
・自己修正：時折、考えながら単語の冒頭を繰り返すことがある（例：「けん、研究」「し、しかし」）。
・フィラー：思考の合間に「えーっと、その、まあ…」のようにつなぎ言葉を自然に連結させることがある。
・間（Pause）：思考を整理するための、意図的ではない自然な間を置く。
・呼吸：常に一定ではなく、話の区切りで不規則になることがある。`;

  // 前のターンがある場合は、コンテキストを追加
  const contextualInstructions = previousTurnText
    ? `${baseInstructions}

直前の発話内容:
「${previousTurnText}」

上記の発話に対する回答として適切な声の調子で話してください。相手の発言の雰囲気や内容に自然に対応し、会話の流れを考慮した適切な音調やペースで発声してください。`
    : baseInstructions;

  const requestOptions: SpeechCreateParams = {
    model: model,
    input: text,
    voice: voiceName,
    response_format: "wav",
    instructions: contextualInstructions,
    speed: 2,
  };
  consola.verbose("Requesting TTS from OpenAI", requestOptions);

  const retryCount = (await argv).retryCount as number;
  const retryMaxDelay = (await argv).retryMaxDelay as number;
  await backOff(
    async () => {
      const response = await azureTTS.audio.speech.create(requestOptions);
      consola.verbose("Received TTS response", response);

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filename, audioBuffer);
    },
    {
      numOfAttempts: retryCount,
      maxDelay: retryMaxDelay,
      retry: (e, attempt) => {
        consola.warn(
          `Failed to synthesize speech after ${attempt} attempts: ${e}`
        );

        // if (e.type === "requests" && (e.status === 429 || e.status >= 500)) {
        //   consola.debug("Retrying due to HTTP error", e);
        //   return true;
        // }

        // consola.debug("Not retrying: ", e);
        return true;
      },
    }
  );
}
