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
 * Description: Main script for podcast generation.
 */

import dotenv from "dotenv";
dotenv.config({
  override: true,
});

import path from "path";
import fs from "fs";
import { PromisePool } from "@supercharge/promise-pool";
import { Type, type Static } from "@sinclair/typebox";
import appRootPath from "app-root-path";
import sanitize from "sanitize-filename";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import { FileSearchAssistant } from "./openai/assistant";
import { argv } from "./args";
import {
  consola,
  generateTimestampInLocalTimezone,
  runId,
  runLogDir,
} from "./logging";
import { AudioGenerator, TurnSchema, Turn } from "./audio";
import { VoiceOptions, VoiceOptionsSchema } from "./openai/tts";
import { LanguageLabels, LanguageOptions } from "./episodes";
import { merge } from "lodash";
import { uploadFile } from "./firebase";
import { ChatCompletion } from "./openai/chat";

const AVERAGE_TURN_DURATION_SECONDS = 13.033141; // https://ut-naelab.slack.com/archives/C07ACRCVAPK/p1722651927644929

function minutesToTurns(minute: number): number {
  return Math.floor((minute * 60) / AVERAGE_TURN_DURATION_SECONDS);
}

export interface MainParams {
  [key: string]: any;
}

export async function main(params?: MainParams) {
  const finalParams = merge({}, argv, params);

  const filePaths = finalParams.papers as string[];

  consola.info(`Initializing assistant with ${filePaths.length} files`);

  const goodAndBadProgramFeatures = `
# Characteristics of desirable programs
- Covering the details of the paper
- Explaining technical terms in detail, including academic definitions
- Accurately reflecting the content of the paper

# Characteristics of inappropriate programmes
- Omitting content from the paper
- Including content that could be misleading
- Include topics unrelated to the content of the paper
- Use technical terms without explanations
- Host do not properly cite the statements of researchers
- Include content unrelated to the paper, such as commercials and previews of upcoming programmes
- Include information not included in the paper, such as personal episodes of researchers
`;

  // 構成作家
  const ChapterSchema = Type.Object(
    {
      title: Type.String({
        description: "Chapter title",
      }),
      conversationTurns: Type.Number({
        description: "Number of conversation turns in this chapter",
      }),
      contents: Type.Array(
        Type.String({
          description: "Contents of the chapter",
        })
      ),
    },
    {
      description: "A section that makes up the program",
    }
  );

  type Chapter = Static<typeof ChapterSchema>;

  const ProgramWriterOutputSchema = Type.Object({
    totalTurns: Type.Number({
      description:
        "Total number of turns. Design the number of turns to fit the length of the input program",
      minimum: 1,
    }),
    program: Type.Array(ChapterSchema, {
      description: "List of sections of the program",
    }),
  });

  type ProgramWriterOutput = Static<typeof ProgramWriterOutputSchema>;

  const programWriterOutputExample: ProgramWriterOutput = {
    totalTurns: 100,
    program: [
      {
        title:
          "Introduction and Overview of the Program: Mobile reading and engagement with knowledge",
        conversationTurns: 10,
        contents: [
          "Summary of PaperWave and aim of the research.",
          "Overview of what will be covered in the episode.",
          "The spread of audio content and its impact on learning",
        ],
      },
      {
        title:
          "The research perspective of 'constructionism' and the importance of this research",
        conversationTurns: 16,
        contents: [
          "Historical context of the teoretical background.",
          "Explanation of key concepts: 'personally meaningful' and 'object to think with.'",
          "How these concept related with this study?",
        ],
      },
      {
        title: "Main Related Work",
        conversationTurns: 14,
        contents: [
          "An overview of the field of maker education.",
          "Explanation of the limitations of previous studies.",
          "Explanation of how this study builds upon previous research.",
        ],
      },
      {
        title: "Methods",
        conversationTurns: 14,
        contents: [
          "Explanation of the qualitative research methods used in this study",
          "Details of data collection methods, including interviews and observations",
          "Methods of data analysis. Explanation of thematic analysis and coding methods",
          "Unique aspects of the study's methodology.",
        ],
      },
      {
        title: "Results of thematic analysis and core themes",
        conversationTurns: 12,
        contents: [
          "Presentation of the two core empirical themes.",
          "In-depth analysis of task re-allocation management and expressions of negative affect.",
          "Examples from the research: Oak, Ivory, and Sand teams.",
        ],
      },
      {
        title: "Discussion: Conflict development and management",
        conversationTurns: 12,
        contents: [
          "How conflicts unfold in different teams.",
          "Analysis of negative affect expectations and their impact.",
          "Case-specific reactions and adjustments made by the teams.",
          "Implications of the study on the field of maker education.",
        ],
      },
      {
        title: "Conclusions of the research",
        conversationTurns: 12,
        contents: [
          "Summary of the study’s findings.",
          "Limitations of the study and suggestions for future research.",
        ],
      },
      {
        title: "Questions from the audience",
        conversationTurns: 10,
        contents: [
          "Questions from the audience.",
          "Answers from the researcher.",
        ],
      },
    ],
  };

  let programWriterInstructions;

  if (finalParams.language === "ja") {
    programWriterInstructions = `
ゆっくり丁寧に思考してください。
# 目的
あなたはラジオの教育番組の放送作家です．PDFの学術論文の内容を専門的に解説する番組の章立てを考えます．

# 入力
番組の長さ（ターンの数）

# 出力
研究を解説するラジオ番組の構成．PDFの論文の特徴を反映するように，コーナーを考案し，各コーナーのタイトルと内容を出力する．

## 出力の条件
- セクションのタイトルは論文の章立てに即している．
- セクションのタイトルは日本語で出力する．
- 1つのセクションには最低8ターンが含まれる．
- 8ターン以下になる場合は，他のセクションと統合する．
- 1つのセクションは最大12ターンまでにする．
- json形式で出力する．

すべての出力は日本語で行いなさい．
`;
  } else if (finalParams.language === "ko") {
    programWriterInstructions = `
천천히 신중하게 사고해 주세요.
# 목적
당신은 교육방송 라디오의 방송작가입니다. PDF형식의 학술논문의 내용을 전문적으로 해설하는 방송의 구성을 생각합니다.

# 입력
방송의 길이 (턴 수)

# 출력
연구를 해설하는 라디오 방송의 구성. PDF형식인 논문의 특징을 반영할 수 있도록 코너를 고안하여, 각 코너의 제목과 내용을 출력함.

## 출력 조건
- 섹션의 제목은 논문의 목차 구성에 들어맞을 것.
- 섹션의 제목은 한국어로 출력할 것.
- 한 개의 섹션에는 최저 8개의 턴이 포함될 것.
- 8개 이하가 될 경우에는 다른 섹션과 통합할 것.
- 1개의 섹션은 최대 12턴까지로 할 것.
- JSON형식으로 출력할 것.

모든 출력은 한국어로 진행해 주세요.
`;
  } else {
    programWriterInstructions = `
Think slowly and carefully.
# Objective.
You are a radio program editor of an educational program, and you are considering a chapter for a program that expertly explains the content of a PDF academic article.

# Input
Length of the program (number of turns)

# Output
Output the chapters of a radio program; devise chapters to reflect the sections of the PDF article and output the title and content of each chapter.


## Requirements for output
- The chapter titles should be related with the section titles of the paper.
- Chapter titles should be output in English.
- A chapter should contain at least 8 turns.
- If the number of turns is less than 8, the chapter should be merged with other chapters.
- A chapter should contain a maximum of 12 turns.
- Output in JSON format.

All outputs should be in English.
`;
  }

  const programWriter = new FileSearchAssistant(
    filePaths,
    `
${programWriterInstructions}

Write the chapter titles and contents in ${LanguageLabels[
      finalParams.language as LanguageOptions
    ].toString()}.

## Schema of the output
${JSON.stringify(ProgramWriterOutputSchema)}

## Output example 
Input:
100 turns

Output:
${JSON.stringify(programWriterOutputExample)}

${goodAndBadProgramFeatures}
`,
    {
      name: "program_writer",
      llmModel: finalParams.llmModel,
      retryCount: finalParams.retryCount,
      retryMaxDelay: finalParams.retryMaxDelay,
      temperature: 0.3,
    }
  );

  const InfoExtractorOutputSchema = Type.Object({
    result: Type.String({
      description: "Extracted information",
    }),
  });

  type InfoExtractorOutput = Static<typeof InfoExtractorOutputSchema>;

  const inforExtractorOutputExample: InfoExtractorOutput = {
    result: "Ron Wakkary",
  };
  const infoExtractorOutputExampleTitle: InfoExtractorOutput = {
    result:
      "コプター: 人間と共に行動しながら 自律的に動作するモノにおけるデザイン要件の検討",
  };
  // 情報検索
  const infoExtractorSystemPrompt = `
# 目的
あなたは情報検索AIです．ユーザから指定された情報を，PDFの学術論文から抽出し，json形式で結果を返却します．

# 入力
検索する情報のキーワード

# 出力
入力されたキーワードに関連する情報を抽出する．
json形式で出力する．json以外のテキストは一切出力しない．
json以外の形式で結果を出力することは禁止

## 出力形式のスキーマ
${JSON.stringify(InfoExtractorOutputSchema)}

## 出力例
入力:
論文の第1著者

出力:
${JSON.stringify(inforExtractorOutputExample)}

## 出力例2
入力:
論文のタイトル

出力:
${JSON.stringify(infoExtractorOutputExampleTitle)}
`;

  const ScriptWriterInputSchema = Type.Object(
    {
      author: Type.String({
        description: "The author of the paper to be introduced",
      }),
      currentSection: ChapterSchema,
      nextSection: Type.Optional(ChapterSchema),
    },
    {
      description: `The input to the script writer
  - author: The author of the paper to be introduced
  - currentSection: Information of the current chapter. The script writer uses this information to generate the script of the current chapter.
  - nextSection: Information of the next chapter. The script writer uses this information just for reference. Never generate scripts of next chapter.`,
    }
  );

  type ScriptWriterInput = Static<typeof ScriptWriterInputSchema>;

  const ScriptWriterOutputSchema = Type.Object({
    title: Type.String({
      description: "Title of the current chapter",
    }),
    nextTitle: Type.Optional(
      Type.String({
        description: "Title of the next chapter",
      })
    ),
    conversationTurns: Type.Number({
      description: "Number of conversation turns in this chapter",
    }),
    script: Type.Array(TurnSchema, {
      description: "Script of the chapter",
    }),
  });

  type ScriptWriterOutput = Static<typeof ScriptWriterOutputSchema>;

  let radioHostVoice: VoiceOptions = "onyx";
  let guestVoice: VoiceOptions = "fable";

  // アシスタントの初期化
  await programWriter.init();

  consola.info("Generating chapter structure");
  const programDuration = finalParams.minute ?? 5;
  consola.debug(`Program duration: ${programDuration}分`);
  const programTotalTurns = minutesToTurns(programDuration);
  await programWriter.runAssistant([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${programTotalTurns} turns. 
          Please make sections to structure the podcast program in ${programTotalTurns} turns. 
          「${programTotalTurns} ターン」は出演者の発話が${programTotalTurns}回あることを表します．`,
        },
      ],
    },
  ]);
  const program = await programWriter.parseMessage<ProgramWriterOutput>(-1);

  if (!program) {
    throw new Error("Program writer did not return a valid program");
  }

  consola.info(JSON.stringify(program, null, 2));

  consola.info("Extracting information");
  const extractTasks = [
    "論文の第1著者をjsonで出力",
    "論文のタイトルをjsonで出力",
  ];

  const { results: extractionResults } = await PromisePool.withConcurrency(
    finalParams.assistantConcurrency
  )
    .for(extractTasks)
    .useCorrespondingResults()
    .process(async (task, index, pool) => {
      consola.debug(`Extracting information for task: ${task}`);
      const extractor = new FileSearchAssistant(
        filePaths,
        infoExtractorSystemPrompt,
        {
          name: `${task}_${runId}`,
          llmModel: finalParams.llmModel,
          retryCount: finalParams.retryCount,
          retryMaxDelay: finalParams.retryMaxDelay,
          temperature: 0,
        }
      );
      await extractor.init();

      await extractor.runAssistant([
        {
          role: "user",
          content: [
            {
              type: "text",
              text: task,
            },
          ],
        },
      ]);

      await extractor.deinit();

      const result = await extractor.parseMessage<InfoExtractorOutput>(-1);
      if (!result) {
        throw new Error("Info extractor did not return a valid result");
      }

      return result;
    });

  const authorText =
    extractionResults[0] !== PromisePool.notRun &&
    extractionResults[0] !== PromisePool.failed
      ? (extractionResults[0] as { result: string }).result
      : "Unknown author";
  consola.debug(`Author: ${authorText}`);
  const paperTitleText =
    extractionResults[1] !== PromisePool.notRun &&
    extractionResults[1] !== PromisePool.failed
      ? (extractionResults[1] as { result: string }).result
      : "Unknown title";
  consola.debug(`Paper title: ${paperTitleText}`);

  // Voice description is generated by gemini-1.5-pro-002
  const voiceSelectorResponseFormat = z.object({
    result: z.union([
      z.literal("alloy"),
      z.literal("echo"),
      z.literal("fable"),
      z.literal("nova"),
      z.literal("shimmer"),
    ]),
  });

  const voiceSelectorPrompt = `
# 目的
ポッドキャストに出演する論文の著者の音声モデルを，ドキュメントを解釈して決定し，モデル名をjsonで出力してください．音声モデルのリスト ["alloy", "echo", "fable", "nova", "shimmer"]

# 入力
著者名

# 出力
入力されたキーワードに関連する情報を抽出する．
json形式で出力する．json以外のテキストは一切出力しない．
json以外の形式で結果を出力することは禁止

# 各音声モデルの説明

## alloy
Alloyは、やや低めの落ち着いた声を持つ、知的な印象を与える声質です。声のトーンは穏やかで、信頼感を抱かせる響きがあります。アクセントは標準的なアメリカ英語で、明晰な発音です。年齢層は30代後半から40代前半の男性を想起させます。

雰囲気としては、落ち着いた知性と穏やかさを兼ね備えています。学術的な内容や、信頼性を重視するコンテンツに適しています。感情表現は控えめで、淡々としたナレーションに適しています。専門知識を伝える際、聞き手に安心感と信頼感を与えるでしょう。

以下に、Alloyの特徴を箇条書きでまとめます。

声の高さ: やや低め
アクセント: 標準的なアメリカ英語
雰囲気: 知的、穏やか、信頼感、落ち着いた
声質から推測される年齢層: 30代後半〜40代前半の男性

## echo
声の高さ: 比較的低く、落ち着いた印象。男性の声と推測されます。
アクセント: アメリカ英語のアクセントが感じられます。癖は少なく、標準的な発音に近いように聞こえます。
雰囲気: 知的で冷静、かつ自信に満ちた印象を与えます。アカデミックな内容を話す際に適した声質です。落ち着いたトーンで話していますが、単調ではなく、程よく抑揚があります。
声質から推測される年齢層: 30代後半から50代前半。落ち着いた声質と、洗練された話し方から、ある程度の年齢と経験を持つ人物を連想させます。

## fable
声の高さ: 中音域。落ち着いた印象を与えます。
アクセント: アメリカ英語。比較的標準的なアクセントで、癖が少ないため聞き取りやすいです。
雰囲気: 知的で、穏やかで、信頼感があります。アカデミックな内容の読み上げに適しています。ややフォーマルな印象も持ち合わせています。
声質から推測される年齢層: 20代後半から30代前半。落ち着きがありながらも、若々しさも感じられます。
その他: 滑舌が良く、明瞭で聞き取りやすい。抑揚は控えめながらも、自然でロボットのような単調さは感じられません。

## nova
声の高さ: 比較的低めの声で、落ち着いた印象を与えます。特に語尾に向かってやや低くなる傾向があります。
アクセント: アメリカ英語のアクセントがベースとなっています。明瞭な発音で、癖が少ないため聞き取りやすいです。
雰囲気: 知的で冷静、落ち着いた雰囲気です。アカデミックな内容の読み上げに適しています。感情表現は控えめで、淡々とした口調です。
声質から推測される年齢層: 30代から40代前半の印象を受けます。落ち着いた声質と、明瞭な発音から、ある程度の社会経験を積んだ人物を連想させます。
その他: 声に温かみがあり、機械音声っぽさはあまり感じられません。人間らしい自然な発声で、長時間聞いていても疲れにくい声質です。

## shimmer
声の高さ: 比較的高い声で、明るく軽快な印象を与えます。
アクセント: アメリカ英語のアクセントがベースで、明瞭な発音です。特に訛りは感じられません。
雰囲気: 親しみやすく、知的な印象です。落ち着いたトーンで話しており、信頼感を与えます。プレゼンテーションやナレーションに適した声質です。
声質から推測される年齢層: 20代後半から30代前半の女性を想起させます。
その他: 声にわずかな息漏れがあり、それが柔らかさや自然さを加えています。機械的な音声合成とは異なり、人間らしい温かみを感じさせます。
`;
  const voiceSelector = new ChatCompletion(voiceSelectorPrompt, {
    temperature: 0,
    model: finalParams.llmModel,
    response_format: zodResponseFormat(
      voiceSelectorResponseFormat,
      "guest_voice_format"
    ),
  });

  const voiceSelectorChatResults = await voiceSelector.completion(
    `論文の著者の音声モデルを決定し，モデル名をjsonで出力してください．著者名：「${authorText}」`
  );
  consola.debug(
    "Voice Selector: ",
    voiceSelectorChatResults.content?.toString()
  );
  const voiceSelectorResults = JSON.parse(
    voiceSelectorChatResults.content?.toString() ?? "{}"
  ) as InfoExtractorOutput;

  // VoiceOptionsに含まれる名前であることを確認してから代入
  if (
    ["alloy", "echo", "fable", "nova", "shimmer"].includes(
      voiceSelectorResults.result
    )
  ) {
    guestVoice = voiceSelectorResults.result as VoiceOptions;
  } else {
    consola.warn("Got invalid guest speaker model: ", extractionResults[2]);
  }
  consola.debug(`Guest voice: ${guestVoice}`);

  const scriptWriterInputExampleIntro: ScriptWriterInput = {
    author: "John Doe",
    currentSection: programWriterOutputExample.program[0],
    nextSection: programWriterOutputExample.program[1],
  };

  const scriptWriterOutputExampleIntro: ScriptWriterOutput = {
    title: "Introduction and Overview of the Program",
    nextTitle: "Theoretical Framework of the Study",
    conversationTurns: 12,
    script: [
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "Welcome to PaperWave. Today, we have John Doe with us to talk about his research, 'Suppression of floating image degradation using a mechanical vibration of a dihedral corner reflector array.' John, thank you for joining us.",
      },
      {
        speaker: "John Doe",
        voice: guestVoice,
        text: "Thank you for having me.",
      },
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "Let's start with an overview of your research. Can you tell us about the main focus of your study?",
      },
    ],
  };
  const scriptWriterInputExampleMiddle: ScriptWriterInput = {
    author: "John Doe",
    currentSection: programWriterOutputExample.program[2],
    nextSection: programWriterOutputExample.program[3],
  };
  const scriptWriterOutputExampleMiddle: ScriptWriterOutput = {
    title: "Discussion 2: The relationship between skills and tools",
    nextTitle: "Discussion 3: Tutorial format and sequence",
    conversationTurns: 20,
    script: [
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "Let's move on to the discussion of the insights gained from the fieldwork.",
      },
      {
        speaker: "John Doe",
        voice: guestVoice,
        text: "Yes, there was an interesting relationship between skills and tools.",
      },
    ],
  };
  const scriptWriterInputExampleEnd: ScriptWriterInput = {
    author: "John Doe",
    currentSection: programWriterOutputExample.program[-1],
  };
  const scriptWriterOutputExampleEnd: ScriptWriterOutput = {
    title: "Closing: Conclusion and future work",
    conversationTurns: 12,
    script: [
      {
        speaker: "John Doe",
        voice: guestVoice,
        text: "In conclusion, the results of the study suggest that...",
      },
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "Thank you for joining us today. Our guest was John Doe, who talked about 'Suppression of floating image degradation using a mechanical vibration of a dihedral corner reflector array.'",
      },
    ],
  };

  let scriptWriterInstructions;

  if (finalParams.language === "ja") {
    scriptWriterInstructions = `
ゆっくり丁寧に思考してください。
# 役割
あなたはラジオの教育番組の放送作家です．PDFの学術論文の内容を専門的に解説する番組の台本を書きます．

# パーソナリティの設定
・ラジオパーソナリティのプロフェッショナルです。
・論文の著者が気持ちよく話せるような聞き役として振る舞います。
・相槌を打つことで会話を自然なものにします
・研究者の発言内容を言い換えることで内容を強調します
・穏やかで丁寧なトーン、専門用語をわかりやすく解説する。
・クリアで、論理的なトーン。議論をリードしつつ、リスナーが理解しやすいように工夫する。

# 研究者の設定
・研究者は論文の内容をわかりやすく説明する研究者です

出力はすべて日本語で行ってください。
`;
  } else if (finalParams.language === "ko") {
    scriptWriterInstructions = `
천천히 신중하게 사고해 주세요. 
# 역할
당신의 교육방송 라디오의 방송작가입니다. PDF형식의 학술논문의 내용을 전문적으로 해설하는 방송의 대본을 작성합니다.

# 퍼스널리티의 설정
・라디오 퍼스널리티의 프로페셔널입니다.
・논문의 저자가 기분 좋게 이야기할 수 있도록 하는 역할을 수행합니다.
・대화를 자연스럽게 만들기 위해 반응을 합니다.
・연구자의 발언 중요 부분에 놀라운 반응을 하고, 연구자의 발언 내용을 강조하기 위해 다시 말합니다.
・온화하고 정중한 톤, 전문 용어를 이해하기 쉽게 설명합니다.
・명확하고 논리적인 톤. 청취자가 이해하기 쉽도록 노력합니다.

모든 출력은 한국어로 진행해 주세요.
`;
  } else {
    scriptWriterInstructions = `
Think slowly and carefully. 
# Objective.
You are a script writer of an educational program, and you write a script for a episode that expertly explains the content of a PDF academic article.

# Personality settings
- A professional radio personality.
- Acts as a listener role that makes the author feel comfortable talking.
- Reacts to the conversation to make it natural.
- Rephrases the author's statements to emphasize the content.
- Gentle and polite tone, explains technical terms in an easy-to-understand way.
- Clear and logical tone. Leads the discussion while making it easy for listeners to understand.

# Researcher settings
- The researcher is an expert who explains the content of the paper in an easy-to-understand way.

All outputs should be in English.
`;
  }

  // 脚本家
  const scriptWriter = new FileSearchAssistant(
    filePaths,
    `
${scriptWriterInstructions}

# Participants of the program
${radioHostVoice}（voice: ${radioHostVoice}）: Host
〈紹介される論文の著者（入力される）〉(voice: ${guestVoice}): Researcher

${goodAndBadProgramFeatures}

# Input
In JSON format with the following schema:

${JSON.stringify(ScriptWriterInputSchema)}

## Input example (Introduction)
${JSON.stringify(scriptWriterInputExampleIntro)}

# Output
- Output script in JSON format.
- Language of script is ${
      LanguageLabels[finalParams.language as LanguageOptions]
    }
- If you translate an original Word into another language, include the original English word for inportant words.

Output schema:
${JSON.stringify(ScriptWriterOutputSchema)}

## Output example 1 (Introduction, not all elements are included in this script)
Input:
${JSON.stringify(scriptWriterInputExampleIntro)}
Output:
${JSON.stringify(scriptWriterOutputExampleIntro)}

## Output example 2 (Middle of the program, not all elements are included in this script)
Input:
${JSON.stringify(scriptWriterInputExampleMiddle)}
Output:
${JSON.stringify(scriptWriterOutputExampleMiddle)}

## Output example 3 (End of the program, not all elements are included in this script)
Input:
${JSON.stringify(scriptWriterInputExampleEnd)}
Output:
${JSON.stringify(scriptWriterOutputExampleEnd)}
`,
    {
      name: "script_writer",
      llmModel: finalParams.llmModel,
      retryCount: finalParams.retryCount,
      retryMaxDelay: finalParams.retryMaxDelay,
    }
  );

  await scriptWriter.init();

  consola.info("Generating script");
  let scriptChunks: Turn[][] = [];
  await PromisePool.withConcurrency(1) // force concurrency 1 to use context
    .for(program.program)
    .process(async (programItem, index, pool) => {
      const nextProgramItem = program.program[index + 1];
      const scriptWriterInput: ScriptWriterInput = {
        author: authorText ?? "",
        currentSection: programItem,
        nextSection: nextProgramItem,
      };

      for (let i = 0; i < finalParams.retryCount; i++) {
        try {
          await scriptWriter.runAssistant([
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify(scriptWriterInput),
                },
              ],
            },
          ]);

          const result = await scriptWriter.parseMessage<ScriptWriterOutput>(
            -1
          );

          if (!result || !result.script) {
            throw new Error("Script writer did not return a valid script");
          }

          scriptChunks[index] = result.script;

          break; // 成功したらループを抜ける
        } catch (e) {
          consola.error(e);

          continue; // 失敗したらリトライ
        }
      }
    });

  // Generage Output files' name
  const timestamp = generateTimestampInLocalTimezone();
  const workingDir = path.join(runLogDir, "output-" + timestamp);
  if (!fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, { recursive: true });
  }
  const outputFileNameTextAuto =
    sanitize(paperTitleText ?? "output")
      .replace(".", "_")
      .replace(/\s+/g, "_")
      .slice(0, 40) + `_${timestamp}`;
  const outputFileNameText = finalParams.output ?? outputFileNameTextAuto;

  // scriptChunksをフォーマットされたJSONとして独立したファイルに保存
  const scriptWriterOutputPath = path.join(
    workingDir,
    `script-${outputFileNameText}.json`
  );

  const scriptWriterOutput = scriptChunks.map((chunk, index) => ({
    section: program.program[index].title,
    script: chunk,
  }));
  fs.writeFileSync(
    scriptWriterOutputPath,
    JSON.stringify(scriptWriterOutput, null, 2)
  );

  // copy to out dir
  const outDir = path.join(appRootPath.path, "out");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  const outFilePath = path.join(outDir, path.basename(scriptWriterOutputPath));
  fs.copyFileSync(scriptWriterOutputPath, outFilePath);

  uploadFile(scriptWriterOutputPath, "script");

  // スクリプトのチャンクを1次元配列に変換して，全体のスクリプトを生成
  const script = scriptChunks.flat();

  consola.verbose("All script of this program...", script);

  consola.info("Removing assistant");
  await Promise.all([programWriter.deinit(), scriptWriter.deinit()]);

  // Generate audio
  consola.info("Generating audio files");
  const audioOutputDir = path.join(workingDir, "output_audio");
  const bgmPath = path.resolve(appRootPath.path, finalParams.bgm as string);
  let bgmVolume;
  try {
    bgmVolume = parseFloat(finalParams.bgmVolume);
  } catch (e) {
    bgmVolume = 0.25;
  }
  let ttsConcurrency;
  try {
    ttsConcurrency = parseInt(finalParams.ttsConcurrency);
  } catch (e) {
    ttsConcurrency = 20;
  }

  const audioGenerator = new AudioGenerator(
    script,
    audioOutputDir,
    outputFileNameText ? `radio-${outputFileNameText}` : "output",
    bgmPath,
    bgmVolume,
    ttsConcurrency
  );

  return await audioGenerator.generate();
}
if (require.main === module) {
  main();
}
