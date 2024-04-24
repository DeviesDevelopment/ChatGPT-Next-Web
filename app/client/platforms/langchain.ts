import { ChatOptions, LLMApi, LLMModel, LLMUsage } from "../api";

export class LangChainApi implements LLMApi {
  chat(options: ChatOptions): Promise<void> {
    throw new Error("Method not implemented.");
  }

  usage(): Promise<LLMUsage> {
    throw new Error("Method not implemented.");
  }

  models(): Promise<LLMModel[]> {
    throw new Error("Method not implemented.");
  }
}
