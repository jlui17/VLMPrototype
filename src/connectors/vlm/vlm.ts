export interface VLMResponse {
  answer: string;
}

export interface VLMProvider {
  query(video: Buffer, question: string): Promise<VLMResponse>;
}
