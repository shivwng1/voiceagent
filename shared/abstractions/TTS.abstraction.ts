import { ITTSConfig, ITTSEvents } from "@/interfaces/abstraction.interface";
import { EventEmitter } from "node:events";


export default abstract class TTS extends EventEmitter {
  name = "TTS";
  protected config: ITTSConfig;
  constructor(config:ITTSConfig){
    super();
    this.config = config;
  }
  on<K extends keyof ITTSEvents>(event: K, listener: ITTSEvents[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ITTSEvents>(
    event: K,
    ...args: Parameters<ITTSEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
  async connect() {}
  close() {}
  clear() {}
  sendText(text: string) {}
  sendDelta(delta: string, isFinal?: boolean) {}
  flush(){}
  
  // Event types
  static readonly EVENTS = {
    AUDIO: "audio",
  } as const;
}
