import dotenv from "dotenv";
dotenv.config({
  override: true,
});

import path from "path";
import { PromisePool } from "@supercharge/promise-pool";
import { Type, type Static } from "@sinclair/typebox";
import appRootPath from "app-root-path";
import sanitize from "sanitize-filename";

import { FileSearchAssistant } from "./openai/assistant";
import { argv } from "./args";
import { consola, runId, runLogDir } from "./logging";
import { spinnies } from "./spinnies";
import { AudioGenerator, TurnSchema, Turn } from "./audio";
import { VoiceOptions } from "./openai/tts";
import { merge } from "lodash";

const AVERAGE_TURN_DURATION_SECONDS = 13.033141; // https://ut-naelab.slack.com/archives/C07ACRCVAPK/p1722651927644929

const goodAndBadProgramFeatures = `
# 望ましい番組の特徴
・論文の詳細までを網羅する
・専門用語は専門的な定義などを交えて詳しく解説する
・論文の内容を正確に反映する

# 不適切な番組の特徴
・論文の内容を省略したり、誤解を招くような内容
・論文の内容と関係ない話題を含む
・専門用語をそのまま使い、説明を省略する
・研究者の発言を適切に引用しない
・CMや番組の紹介，次回予告など、論文と関係ない内容を含む
・研究者の個人的エピソードなど，論文に記載されてない情報を含む
`;

function minutesToTurns(minute: number): number {
  return Math.floor((minute * 60) / AVERAGE_TURN_DURATION_SECONDS);
}

const ProgramSectionSchema = Type.Object(
  {
    title: Type.String({
      description: "セクションのトピック",
    }),
    conversationTurns: Type.Number({
      description: "このセクションでの会話のターン数",
    }),
    contents: Type.Array(
      Type.String({
        description: "セクションの内容",
      })
    ),
  },
  {
    description: "番組を構成する1つのセクション",
  }
);

type ProgramSection = Static<typeof ProgramSectionSchema>;

const ProgramWriterOutputSchema = Type.Object({
  totalTurns: Type.Number({
    description:
      "総ターン数．入力された番組の長さに収まるようにターン数を設計する",
    minimum: 1,
  }),
  program: Type.Array(ProgramSectionSchema, {
    description: "番組の各セクションのリスト",
  }),
});

type ProgramWriterOutput = Static<typeof ProgramWriterOutputSchema>;

const InfoExtractorOutputSchema = Type.Object({
  result: Type.String({
    description: "論文PDFから抽出された情報",
  }),
});

type InfoExtractorOutput = Static<typeof InfoExtractorOutputSchema>;

const ScriptWriterInputSchema = Type.Object(
  {
    author: Type.String({
      description: "紹介される論文の著者",
    }),
    currentSection: ProgramSectionSchema,
    nextSection: Type.Optional(ProgramSectionSchema),
  },
  {
    description: `脚本家に入力される情報
  - author: 紹介される論文の著者
  - currentSection: 脚本家が脚本を生成する現在のSectionの情報
  - nextSection: 次のSectionの情報．現在のセクションの情報を生成する参考にするだけで，nextSectionの脚本は生成しない`,
  }
);

type ScriptWriterInput = Static<typeof ScriptWriterInputSchema>;

const ScriptWriterOutputSchema = Type.Object({
  title: Type.String({
    description: "脚本を生成する現在のセクションのタイトル",
  }),
  nextTitle: Type.Optional(
    Type.String({
      description: "次のセクションのタイトル",
    })
  ),
  conversationTurns: Type.Number({
    description: "コーナーでの会話のターン数",
  }),
  script: Type.Array(TurnSchema, {
    description: "コーナーの台本の全ての発言のリスト",
  }),
});

type ScriptWriterOutput = Static<typeof ScriptWriterOutputSchema>;

export interface MainParams {
  [key: string]: any;
}

export async function main(params?: MainParams) {
  const finalParams = merge({}, argv, params);

  const filePaths = finalParams.papers as string[];

  consola.info(`Initializing assistant with ${filePaths.length} files`);

  // 構成作家
  const programWriterOutputExample: ProgramWriterOutput = {
    totalTurns: 100,
    program: [
      {
        title: "番組の導入と概要",
        conversationTurns: 12,
        contents: [
          "Introduction of the authors",
          "Introduction to the topic.",
          "Overview of what will be covered in the program.",
          "Explanation of why task re-allocation in new venture teams is essential.",
        ],
      },
      {
        title: "研究の視座「構築主義」とこの研究の重要性",
        conversationTurns: 16,
        contents: [
          "Historical context and background of the study.",
          "Explanation of key concepts: new venture teams, task re-allocation, and conflict.",
          "Explanation of the importance of the study.",
        ],
      },
      {
        title: "主要な関連研究",
        conversationTurns: 14,
        contents: [
          "関連研究が議論されてきた研究分野の概観",
          "Explanation of the limitations of previous studies.",
          "Explanation of how this study builds upon previous research.",
        ],
      },
      {
        title: "研究の方法",
        conversationTurns: 12,
        contents: [
          "本研究で用いた質的研究の方法の解説",
          "インタビューと観察を含む，データ収集の方法の詳細",
          "データ分析の方法．主題分析とコーディングの方法の説明",
          "Unique aspects of the study's methodology.",
        ],
      },
      {
        title: "主題分析の結果とコアテーマ",
        conversationTurns: 12,
        contents: [
          "Presentation of the two core empirical themes.",
          "In-depth analysis of task re-allocation management and expressions of negative affect.",
          "Examples from the research: Oak, Ivory, and Sand teams.",
        ],
      },
      {
        title: "タスク再割り当て紛争の出現",
        conversationTurns: 10,
        contents: [
          "How task re-allocation issues emerge.",
          "Examples and case studies from the three teams analyzed.",
          "Discussion on developmental milestones and task re-allocation oppositions.",
        ],
      },
      {
        title: "考察: 対立の展開と管理",
        conversationTurns: 12,
        contents: [
          "How conflicts unfold in different teams.",
          "Analysis of negative affect expectations and their impact.",
          "Case-specific reactions and adjustments made by the teams.",
        ],
      },
      {
        title: "結論と研究の意義",
        conversationTurns: 12,
        contents: [
          "Summary of the study’s findings and its contributions to existing literature.",
          "Practical implications for new venture teams and conflict management.",
          "本研究の限界と今後の展望",
        ],
      },
    ],
  };
  const programWriter = new FileSearchAssistant(
    filePaths,
    `
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

## 出力形式のスキーマ
${JSON.stringify(ProgramWriterOutputSchema)}

## 出力例（以下の出力例は論文の特徴を反映しない仮想的な例です．実際の出力では論文の章の見出しなどの情報を取り入れて構成してください．）
入力:
100 turns

出力:
${JSON.stringify(programWriterOutputExample)}

${goodAndBadProgramFeatures}
`,
    "program_writer"
  );

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

  const radioHostVoice: VoiceOptions = "onyx";
  const guestVoice: VoiceOptions = "fable";

  const scriptWriterInputExampleIntro: ScriptWriterInput = {
    author: "Ron Wakkary",
    currentSection: programWriterOutputExample.program[0],
    nextSection: programWriterOutputExample.program[1],
  };

  const scriptWriterOutputExampleIntro: ScriptWriterOutput = {
    title: "番組の導入と概要",
    nextTitle: "研究の背景",
    conversationTurns: 12,
    script: [
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: 'PaperWaveへようこそ．今回はRon Wakkaryさんをお迎えして，"Roaming Objects: Encoding Digital Histories of Use into Shared Objects and Tools" という研究についてお話しいただきます．Ron Wakkaryさん，よろしくお願いします．',
      },
      {
        speaker: "Ron Wakkary",
        voice: guestVoice,
        text: "Ron Wakkaryです．よろしくお願いいたします．",
      },
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "まず始めに，この研究の面白い部分を手短に教えていただけますか．",
      },
    ],
  };
  const scriptWriterInputExampleMiddle: ScriptWriterInput = {
    author: "Ron Wakkary",
    currentSection: programWriterOutputExample.program[2],
    nextSection: programWriterOutputExample.program[3],
  };
  const scriptWriterOutputExampleMiddle: ScriptWriterOutput = {
    title: "考察2: 能力とツールの関係",
    nextTitle: "考察3: チュートリアルのフォーマットとシーケンス",
    conversationTurns: 20,
    script: [
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "それではここからは，フィールドワークで得られた知見についてディスカッションしていきましょう．",
      },
      {
        speaker: "Ron Wakkary",
        voice: guestVoice,
        text: "はい，能力とツールには面白い関係がありました．",
      },
    ],
  };
  const scriptWriterInputExampleEnd: ScriptWriterInput = {
    author: "Ron Wakkary",
    currentSection: programWriterOutputExample.program[-1],
  };
  const scriptWriterOutputExampleEnd: ScriptWriterOutput = {
    title: "結論",
    conversationTurns: 12,
    script: [
      {
        speaker: "Ron Wakkary",
        voice: guestVoice,
        text: "今日は、話をさせていただきありがとうございました。",
      },
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: 'ありがとうございました。本日のゲストはRon Wakkaryさんで，"Roaming Objects: Encoding Digital Histories of Use into Shared Objects and Tools" についてお話しいただきました．',
      },
    ],
  };
  // 脚本家
  const scriptWriter = new FileSearchAssistant(
    filePaths,
    `
ゆっくり丁寧に思考してください。
# 役割
あなたはラジオの教育番組の放送作家です．PDFの学術論文の内容を専門的に解説する番組の台本を書きます．

# 番組の出演者
${radioHostVoice}（voice: ${radioHostVoice}）：番組のパーソナリティ
〈紹介される論文の著者（入力される）〉(voice: ${guestVoice})：論文の著者

# パーソナリティの設定
・ラジオパーソナリティのプロフェッショナルです。
・論文の著者が気持ちよく話せるような聞き役として振る舞います。
・相槌を打つことで会話を自然なものにします
・研究者の発言の重要箇所で驚くリアクションをし，研究者の発言内容を言い換えることで内容を強調します
・穏やかで丁寧なトーン、専門用語をわかりやすく解説する。
・クリアで、論理的なトーン。議論をリードしつつ、リスナーが理解しやすいように工夫する。

# 研究者の設定
・研究者は論文の内容をわかりやすく説明する研究者です

${goodAndBadProgramFeatures}

# 入力
JSON形式で入力されます．コーナーごとに繰り返し入力されます．

## 入力形式のスキーマ
${JSON.stringify(ScriptWriterInputSchema)}

## 入力例
${JSON.stringify(scriptWriterInputExampleIntro)}

# 出力
json形式で，台本を出力しなさい．台本の言語は日本語にしなさい．ただし，英語の単語 (word) を翻訳 (translate) するときは，元の英単語も併記しなさい．

## 出力形式のスキーマ
${JSON.stringify(ScriptWriterOutputSchema)}

## 出力例1（最初のコーナー，scriptには全ての要素は含まれていない．）
入力:
${JSON.stringify(scriptWriterInputExampleIntro)}
出力:
${JSON.stringify(scriptWriterOutputExampleIntro)}

## 出力例2（中盤のコーナー，scriptには全ての要素は含まれていない．）
入力:
${JSON.stringify(scriptWriterInputExampleMiddle)}
出力:
${JSON.stringify(scriptWriterOutputExampleMiddle)}

## 出力例3（最後のコーナー，scriptには全ての要素は含まれていない．）
入力:
${JSON.stringify(scriptWriterInputExampleEnd)}
出力:
${JSON.stringify(scriptWriterOutputExampleEnd)}
`,
    "script_writer"
  );

  // ここから処理を開始 ----------------------------------------------------------

  // アシスタントの初期化
  await Promise.all([programWriter.init(), scriptWriter.init()]);

  consola.info("プログラムの構成を開始します...");
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

  consola.info("情報を抽出します");
  const extractTasks = [
    "論文の第1著者をjsonで出力",
    "論文のタイトルをjsonで出力",
  ];

  const { results: extractionResults } = await PromisePool.withConcurrency(
    (
      await argv
    ).assistantConcurrency
  )
    .for(extractTasks)
    .process(async (task, index, pool) => {
      const extractor = new FileSearchAssistant(
        filePaths,
        infoExtractorSystemPrompt,
        `${task}_${runId}`
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

  const authorText = extractionResults[0]?.result;
  const paperTitleText = extractionResults[1]?.result;

  const outputFileNameText =
    sanitize(paperTitleText ?? "output")
      .replace(".", "_")
      .replace(/\s+/g, "_")
      .slice(0, 40) + `_${runId}`;

  consola.info("脚本を生成します");
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

          consola.debug(
            `Script writer output: ${JSON.stringify(result, null, 2).slice(
              0,
              200
            )}\n
-----------------------\n
${JSON.stringify(result, null, 2).slice(-200)}\n\n
-----------------------\n
script length in program: ${programItem.conversationTurns}\n
script actual length: ${result?.script.length}`
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

  // スクリプトのチャンクを1次元配列に変換して，全体のスクリプトを生成
  const script = scriptChunks.flat();

  consola.verbose("All script of this program...", script);

  // Generate audio
  consola.info("音声ファイルを生成します");
  const audioOutputDir = path.join(runLogDir, "output_audio");
  const bgmPath = path.join(appRootPath.path, finalParams.bgm as string);
  const audioGenerator = new AudioGenerator(
    script,
    audioOutputDir,
    outputFileNameText ? `radio-${outputFileNameText}` : "output",
    bgmPath
  );

  consola.info("アシスタントを削除します");
  await Promise.all([programWriter.deinit(), scriptWriter.deinit()]);
  return await audioGenerator.generate();
}

// main();
