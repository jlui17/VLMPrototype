export interface VLMResponse {
  answer: string;
}

export interface VLMProvider {
  canHandle(model: string): boolean;
  query(model: string, video: Buffer, question: string): Promise<VLMResponse>;
}
