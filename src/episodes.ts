import {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  Timestamp,
  WithFieldValue,
} from "firebase-admin/firestore";
import { DocumentSnapshotType } from "./firebase";

export class RecordingOptions implements DocumentSnapshotType {
  paperUrls: string[];
  minute: number;
  bgm: string;
  bgmVolume: number;
  llmModel: string;
  chatConcurrency: number;
  assistantConcurrency: number;
  ttsModel: string;
  ttsConcurrency: number;
  retryCount: number;
  retryMaxDelay: number;

  constructor(options: { paperUrls: string[] } & Partial<RecordingOptions>) {
    if (!options.paperUrls || options.paperUrls.length === 0) {
      throw new Error("At least one paper URL is required.");
    }

    this.paperUrls = options.paperUrls ?? [];
    this.minute = options.minute ?? 15;
    this.bgm =
      options.bgm ??
      "https://firebasestorage.googleapis.com/v0/b/paperwave.appspot.com/o/bgm%2Fpodcast-jazz-music.mp3?alt=media&token=0b890308-01aa-4f3c-b206-033f6f684d8e";
    this.bgmVolume = options.bgmVolume ?? 0.25;
    this.llmModel = options.llmModel ?? "gpt-4o-mini";
    this.chatConcurrency = options.chatConcurrency ?? 10;
    this.assistantConcurrency = options.assistantConcurrency ?? 10;
    this.ttsModel = options.ttsModel ?? "tts-1";
    this.ttsConcurrency = options.ttsConcurrency ?? 20;
    this.retryCount = options.retryCount ?? 5;
    this.retryMaxDelay = options.retryMaxDelay ?? 150000;
  }
}

export class Author implements DocumentSnapshotType {
  authorId: string;
  name: string;
  paperCount: number;
  citationCount: number;

  constructor(options?: Partial<Author>) {
    this.authorId = options?.authorId ?? "";
    this.name = options?.name ?? "";
    this.paperCount = options?.paperCount ?? 0;
    this.citationCount = options?.citationCount ?? 0;
  }
}

// Reference https://api.semanticscholar.org/api-docs#tag/Paper-Data/operation/get_graph_get_paper
export class Paper implements DocumentSnapshotType {
  doi: string;
  paperId: string;
  url: string;
  semanticScholarUrl: string;
  title: string;
  year: number;
  authors: Author[];
  abstract: string;
  fieldsOfStudy: string[];
  publication: string;
  publicationTypes: string[];
  publicationDate: string;
  tldr: string;
  references: Omit<Paper, "references">[];
  pdfUrl: string;
  numPages: number;

  constructor(options?: Partial<Paper>) {
    this.doi = options?.doi ?? "";
    this.paperId = options?.paperId ?? "";
    this.url = options?.url ?? "";
    this.semanticScholarUrl = options?.semanticScholarUrl ?? "";
    this.title = options?.title ?? "Untitled";
    this.year = options?.year ?? 1000;
    this.authors = options?.authors ?? [];
    this.abstract = options?.abstract ?? "";
    this.fieldsOfStudy = options?.fieldsOfStudy ?? [];
    this.publication = options?.publication ?? "";
    this.publicationTypes = options?.publicationTypes ?? [];
    this.publicationDate = options?.publicationDate ?? "";
    this.tldr = options?.tldr ?? "";
    this.references = options?.references ?? [];
    this.pdfUrl = options?.pdfUrl ?? "";
    this.numPages = options?.numPages ?? 1;
  }
}

export class Chapter implements DocumentSnapshotType {
  title: string;
  startTimeSeconds: number;
  endTimeSeconds: number;

  constructor(options: Partial<Chapter>) {
    this.title = options.title ?? "";
    this.startTimeSeconds = options.startTimeSeconds ?? 0;
    this.endTimeSeconds = options.endTimeSeconds ?? 0;
  }
}

export class Episode implements DocumentSnapshotType {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  uid: string;
  userDisplayName: string;
  title: string;
  description: string;
  tags: string[];
  papers: Paper[];
  coverImageUrl: string;
  recordingOptions: RecordingOptions;
  recordingLogs: string[];
  isRecordingCompleted: boolean;
  isRecordingFailed: boolean;
  status: string;
  contentUrl: string;
  contentDurationSeconds: number; // in seconds
  chapters: Chapter[];
  transcriptUrl: string;
  playCount: number;

  constructor(
    options: { recordingOptions: RecordingOptions } & Partial<
      Omit<Episode, "createdAt" | "updatedAt">
    >
  ) {
    this.createdAt = Timestamp.now();
    this.updatedAt = Timestamp.now();
    this.uid = options.uid ?? "";
    this.userDisplayName = options.userDisplayName ?? "Anonymous";
    this.title = options.title ?? "Untitled";
    this.description = options.description ?? "";
    this.tags = options.tags ?? [];
    this.papers = options.papers ?? [];
    this.coverImageUrl = options.coverImageUrl ?? "/default-cover.png";
    this.recordingOptions = options.recordingOptions;
    this.recordingLogs = options.recordingLogs ?? [];
    this.isRecordingCompleted = options.isRecordingCompleted ?? false;
    this.isRecordingFailed = options.isRecordingFailed ?? false;
    this.status = options.status ?? "pending";
    this.contentUrl = options.contentUrl ?? "";
    this.contentDurationSeconds = options.contentDurationSeconds ?? 0;
    this.chapters = options.chapters ?? [];
    this.transcriptUrl = options.transcriptUrl ?? "";
    this.playCount = options.playCount ?? 0;
  }
}

function objectifyAuthors(authors: Author[]) {
  return authors.map((author) => {
    return { ...author };
  });
}

export function objectifyPapers(papers: Paper[]) {
  return papers.map((paper) => {
    const authors = objectifyAuthors(paper.authors);
    const references = paper.references.map((reference) => {
      const authors = objectifyAuthors(reference.authors);

      return { ...reference, authors };
    });

    return { ...paper, authors, references };
  });
}

export function objectifyEpisode(episode: Episode) {
  const papers = objectifyPapers(episode.papers);
  const recordingOptions = { ...episode.recordingOptions };

  return { ...episode, papers, recordingOptions };
}

export const episodeDataConverter = (): FirestoreDataConverter<Episode> => ({
  toFirestore: (data: WithFieldValue<Episode>) => {
    return objectifyEpisode(data as Episode);
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot<Episode>) => {
    const data = snapshot.data();

    // なぜか必ず型検証に失敗するので検証はしない
    // const ProgramSchema = z.instanceof(Program).catch((ctx) => {
    //   console.warn(ctx.error, ctx.error.errors, ctx.input);
    //   console.info("Repairing Program schema");

    //   // paperUrlsがない場合は例外が発生しうる
    //   const repaired = new Program({ ...ctx.input });

    //   return repaired;
    // });

    // const program = ProgramSchema.parse(data);

    return new Episode({ ...data });
  },
});
