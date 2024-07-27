import * as fs from "fs-extra";
import path from "path";
import { exec as _exec } from "child_process";
import util from "util";
import { PromisePool } from "@supercharge/promise-pool";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { Type, type Static } from "@sinclair/typebox";
import CLIProgress from "cli-progress";

import { openai } from "./openai";
import {
  synthesizeSpeech,
  VoiceOptions,
  VoiceOptionsSchema,
} from "./openai/tts";
import { argv } from "./args";
import { consola } from "./logging";
import { spinnies } from "./spinnies";
import { SingleBar } from "./progress";
import appRootPath from "app-root-path";

// Promisify exec
const exec = util.promisify(_exec);

export const TurnSchema = Type.Object(
  {
    speaker: Type.String({
      description: "話者",
    }),
    voice: VoiceOptionsSchema,
    text: Type.String({
      description: "話者の発言",
    }),
  },
  {
    description: "台本の中の一つの発言",
  }
);

export type Turn = Static<typeof TurnSchema>;

export class AudioGenerator {
  script: Turn[];
  outputDir: string;
  outputFilename: string;
  distDir: string;
  workDir: string;
  bgmPath?: string;

  constructor(
    script: Turn[],
    outputDir: string,
    outputFilename: string,
    bgmPath?: string
  ) {
    this.script = script;
    this.outputFilename = outputFilename || "output";
    this.bgmPath = bgmPath;

    // Initialize directories
    this.outputDir = outputDir;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir);
    }
    this.distDir = path.join(this.outputDir, "dist");
    if (!fs.existsSync(this.distDir)) {
      fs.mkdirSync(this.distDir);
    }
    this.workDir = path.join(this.outputDir, "work");
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir);
    }
    // Clear work directory
    fs.emptyDirSync(this.workDir);
  }

  async generate() {
    const audioSegments: string[] = [];
    const bar = new SingleBar(
      {
        format: "[{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
        stopOnComplete: true,
      },
      CLIProgress.Presets.shades_classic
    );

    bar.start(this.script.length, 0);
    consola.debug("Synthesizing speech segments...");

    // Synthesize speech for each turn in parallel
    await PromisePool.withConcurrency((await argv).ttsConcurrency)
      .for(this.script)
      .process(async (turn, index, pool) => {
        // ソートのためにインデックスは0埋めした4桁数字にする
        const indexPadded = index.toString().padStart(4, "0");
        const speechFilename = path.join(
          this.workDir,
          `speech_${indexPadded}.wav`
        );
        await synthesizeSpeech(turn.text, turn.voice, speechFilename);
        audioSegments.push(speechFilename);
        consola.debug(`Speech segment ${index} synthesized.`);
        bar.increment(1, { filename: speechFilename });
      });

    // sort audio segments by filename to ensure correct order
    audioSegments.sort();

    bar.stop("All speech segments have been synthesized.");
    consola.debug("All speech segments have been synthesized.");

    consola.info("Merge audio files...");
    // Concatenate all audio segments
    consola.debug("Concatenating audio segments...");
    const concatFilename = path.join(this.workDir, "concat.wav");
    await this.concatAudioSegments(audioSegments, concatFilename);

    // Add background music if specified
    const outputWavFilePath = path.join(
      this.distDir,
      `${this.outputFilename}.wav`
    );
    if (this.bgmPath) {
      consola.debug(`Add background music ${this.bgmPath} ...`);
      const bgmFilename = path.join(this.workDir, "with_bgm.wav");
      await this.addBackgroundMusic(concatFilename, this.bgmPath, bgmFilename);
      consola.debug(`Copying ${bgmFilename} to ${this.distDir}`);
      await fs.copyFile(bgmFilename, outputWavFilePath);
    } else {
      consola.debug(`No background music specified.`);
      consola.debug(`Copying ${concatFilename} to ${this.distDir}`);
      await fs.copyFile(concatFilename, outputWavFilePath);
    }

    // Convert to MP3
    const mp3Filename = path.join(this.distDir, `${this.outputFilename}.mp3`);
    consola.debug(`Converting from WAV to MP3: ${mp3Filename}`);
    await exec(`${ffmpegPath} -i "${outputWavFilePath}" -y "${mp3Filename}"`);

    // Copy to output directory in appRootDir
    const rootOutputDir = path.join(appRootPath.path, "out");
    if (!fs.existsSync(rootOutputDir)) {
      fs.mkdirSync(rootOutputDir); // Create output directory if it doesn't exist
    }
    // Clean output directory
    fs.emptyDirSync(rootOutputDir);

    const rootOutputFilename = path.join(
      rootOutputDir,
      `${this.outputFilename}.mp3`
    );
    consola.debug(`Copying ${mp3Filename} to ${rootOutputDir}`);
    await fs.copyFile(mp3Filename, rootOutputFilename);

    consola.info(`Audio file created: ${rootOutputFilename}`);
  }

  async concatAudioSegments(audioSegments: string[], outputFilename: string) {
    const inputFiles = audioSegments.map((audioSegment) => {
      return `-i ${audioSegment}`;
    });
    const inputFilesStr = inputFiles.join(" ");
    const command = `${ffmpegPath} ${inputFilesStr} -filter_complex concat=n=${audioSegments.length}:v=0:a=1 -y ${outputFilename}`;
    consola.debug(`Running command: ${command}`);
    await exec(command);
  }

  async addBackgroundMusic(
    inputFilename: string,
    bgmFilename: string,
    outputFilename: string
  ) {
    // Make BGM duration longer than the input audio
    const bgmDuration = await this.getAudioDuration(inputFilename);
    const bgmExtendedFilename = path.join(this.workDir, "bgm_extended.wav");
    const extendCommand = `${ffmpegPath} -i ${bgmFilename} -filter_complex "aloop=loop=-1:size=${bgmDuration}:start=0" -y ${bgmExtendedFilename}`;
    consola.debug(`Running command: ${extendCommand}`);
    await exec(extendCommand);

    // Add background music to the audio with a specified volume
    const bgmVolume = (await argv).bgmVolume ?? 0.1;
    const mixCommand = `${ffmpegPath} -i ${inputFilename} -i ${bgmExtendedFilename} -filter_complex "[0:a]volume=1.9[a0];[1:a]volume=${bgmVolume}[a1];[a0][a1]amix=inputs=2:duration=first" -y ${outputFilename}`;
    consola.debug(`Running command: ${mixCommand}`);
    await exec(mixCommand);
  }

  async getAudioDuration(filename: string) {
    const command = `${ffmpegPath} -i ${filename} 2>&1 | grep Duration | cut -d ' ' -f 4 | sed s/,//`;
    consola.debug(`Running command: ${command}`);
    const { stdout } = await exec(command);
    const duration = stdout.trim();
    consola.debug(`Duration: ${duration}`);
    return duration;
  }
}
