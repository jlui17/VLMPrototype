import type { VLMProvider } from "./vlm.ts";

export class VLMRegistry {
  private providers: VLMProvider[];

  constructor(providers: VLMProvider[]) {
    this.providers = providers;
  }

  findProvider(model: string): VLMProvider | null {
    return this.providers.find((p) => p.canHandle(model)) ?? null;
  }

  canHandle(model: string): boolean {
    return this.providers.some((p) => p.canHandle(model));
  }
}
