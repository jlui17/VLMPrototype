export type VideoData =
  | { kind: "buffer"; data: Buffer }
  | { kind: "gemini-file"; fileUri: string; mimeType: string };
