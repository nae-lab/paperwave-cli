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

const ProgramWriterOutputSchema = Type.Object({
  totalTurns: Type.Number({
    description:
      "総ターン数．入力された番組の長さに収まるようにターン数を設計する",
    minimum: 1,
  }),
  program: Type.Array(
    Type.Object(
      {
        title: Type.String({
          description: "コーナーのトピック",
        }),
        conversationTurns: Type.Number({
          description:
            "コーナーでの会話のターン数．全コーナーの合計がtotalTurnsになるように設計する",
        }),
      },
      {
        description: "番組を構成するコーナーのリスト",
      }
    )
  ),
});

type ProgramWriterOutput = Static<typeof ProgramWriterOutputSchema>;

const InfoExtractorOutputSchema = Type.Object({
  result: Type.String({
    description: "論文PDFから抽出された情報",
  }),
});

type InfoExtractorOutput = Static<typeof InfoExtractorOutputSchema>;

const ScriptWriterInputSchema = Type.Object({
  author: Type.String({
    description: "紹介される論文の著者",
  }),
  title: Type.String({
    description: "コーナータイトル",
  }),
  nextTitle: Type.Optional(
    Type.String({
      description: "次のコーナータイトル",
    })
  ),
  conversationTurns: Type.Number({
    description: "本コーナーで生成される会話のターン数",
  }),
});

type ScriptWriterInput = Static<typeof ScriptWriterInputSchema>;

const ScriptWriterOutputSchema = Type.Object({
  title: Type.String({
    description: "脚本を生成する現在のコーナーのタイトル",
  }),
  nextTitle: Type.Optional(
    Type.String({
      description: "次のコーナーのタイトル",
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

async function main() {
  const filePaths = (await argv).papers as string[];

  consola.info(`Initializing assistant with ${filePaths.length} files`);

  // 構成作家
  const programWriterOutputExample: ProgramWriterOutput = {
    totalTurns: 100,
    program: [
      {
        title: "番組の導入と概要",
        conversationTurns: 12,
      },
      {
        title: "研究の背景",
        conversationTurns: 12,
      },
      {
        title: "主要な関連研究",
        conversationTurns: 10,
      },
      {
        title: "研究の貢献",
        conversationTurns: 8,
      },
      {
        title: "方法",
        conversationTurns: 16,
      },
      {
        title: "結果",
        conversationTurns: 12,
      },
      {
        title: "考察",
        conversationTurns: 18,
      },
      {
        title: "結論",
        conversationTurns: 12,
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
番組の長さ（分）

# 出力
研究を解説するラジオ番組の構成．PDFの論文の特徴を反映するように，コーナーを考案し，各コーナーのタイトルを出力する．

## 出力の条件
- コーナーのタイトルは論文の章立てに即している．
- コーナーのタイトルは日本語で出力する．
- コーナーの数は入力された番組の長さに収まるように柔軟に増減させる．
- 1つのコーナーには最低6ターンが含まれる．
- 6ターン以下になる場合は，他のコーナーと統合して1つのコーナーにする．
- json形式で出力する．json以外のテキストは一切出力しない．

## 出力形式のスキーマ
${JSON.stringify(ProgramWriterOutputSchema)}

## 出力例（以下の出力例は論文の特徴を反映しない仮想的な例です．実際の出力では論文の章の見出しなどの情報を取り入れて構成してください．）
入力:
15分

出力:
${JSON.stringify(programWriterOutputExample)}
`,
    "program_writer"
  );

  const inforExtractorOutputExample: InfoExtractorOutput = {
    result: "Ron Wakkary",
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

## 不適切な出力例（json以外の形式であるため不適切）
入力:
論文の第1著者

出力: 
論文の第1著者はRon Wakkaryです
`;

  const radioHostVoice: VoiceOptions = "onyx";
  const guestVoice: VoiceOptions = "nova";

  const scriptWriterInputExample: ScriptWriterInput = {
    author: "Ron Wakkary",
    title: "番組の導入と概要",
    nextTitle: "研究の背景",
    conversationTurns: 10,
  };
  const scriptWriterInputExampleIntro: ScriptWriterInput = {
    author: "Ron Wakkary",
    title: "番組の導入と概要",
    nextTitle: "研究の背景",
    conversationTurns: 10,
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
    title: "考察2: 能力とツールの関係",
    nextTitle: "考察3: チュートリアルのフォーマットとシーケンス",
    conversationTurns: 20,
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
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "「能力とツールの関係」は，次のトピックである「チュートリアルのフォーマットとシーケンス」にも関わってきそうですね．",
      },
    ],
  };
  const scriptWriterInputExampleEnd: ScriptWriterInput = {
    author: "Ron Wakkary",
    title: "結論",
    conversationTurns: 12,
  };
  const scriptWriterOutputExampleEnd: ScriptWriterOutput = {
    title: "結論",
    conversationTurns: 12,
    script: [
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "非常に有益なお話をありがとうございました。リスナーの皆さんも、これでDIYにもっと挑戦しやすくなるでしょう。",
      },
      {
        speaker: "Ron Wakkary",
        voice: guestVoice,
        text: "こちらこそ、話をさせていただきありがとうございました。",
      },
      {
        speaker: radioHostVoice,
        voice: radioHostVoice,
        text: "ありがとうございました。それでは今日はここまでにしましょう。また次回をお楽しみに。",
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

# 入力
JSON形式で入力されます．コーナーごとに繰り返し入力されます．

## 入力形式のスキーマ
${JSON.stringify(ScriptWriterInputSchema)}

## 入力例
${JSON.stringify(scriptWriterInputExample)}

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
  await programWriter.runAssistant([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${(await argv).minute}分`,
        },
      ],
    },
  ]);
  const program = await programWriter.parseMessage<ProgramWriterOutput>(-1);

  if (!program) {
    throw new Error("Program writer did not return a valid program");
  }

  consola.info(program);

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
  await PromisePool.withConcurrency((await argv).assistantConcurrency)
    .for(program.program)
    .process(async (programItem, index, pool) => {
      const nextProgramItem = program.program[index + 1];
      const scriptWriterInput: ScriptWriterInput = {
        author: authorText ?? "",
        title: programItem.title,
        nextTitle: nextProgramItem ? nextProgramItem.title : undefined,
        conversationTurns: programItem.conversationTurns,
      };
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

      const result = await scriptWriter.parseMessage<ScriptWriterOutput>(-1);

      if (!result || !result.script) {
        throw new Error("Script writer did not return a valid script");
      }

      scriptChunks[index] = result.script;
    });

  // スクリプトのチャンクを1次元配列に変換して，全体のスクリプトを生成
  const script = scriptChunks.flat();

  consola.verbose(script);

  // Generate audio
  consola.info("音声ファイルを生成します");
  const audioOutputDir = path.join(runLogDir, "output_audio");
  const bgmPath = path.join(appRootPath.path, (await argv).bgm as string);
  const audioGenerator = new AudioGenerator(
    script,
    audioOutputDir,
    outputFileNameText ? `radio-${outputFileNameText}` : "output",
    bgmPath
  );
  await audioGenerator.generate();

  consola.info("アシスタントを削除します");
  await Promise.all([programWriter.deinit(), scriptWriter.deinit()]);
}

main();
