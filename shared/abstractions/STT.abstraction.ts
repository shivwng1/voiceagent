import { EventEmitter } from "./event.abstraction";
import {ISTTConfig,ISTTEventMap} from "@/interfaces/abstraction.interface"


export abstract class STT extends EventEmitter<ISTTEventMap> {
  protected config: ISTTConfig;
  protected isConnected: boolean = false;
  public name:string;

  constructor(config: ISTTConfig = {}) {
    super();
    this.name = "TTS"
    this.config = {
      language: "en-US",
      smart_format: true,
      ...config,
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(audioData: string): Promise<void>;
  abstract isReady(): boolean;

  // Event types
  static readonly EVENTS = {
    TRANSCRIPT: "transcript",
    INTRUPT: "intrupt",
    ERROR: "error",
  } as const;
}
