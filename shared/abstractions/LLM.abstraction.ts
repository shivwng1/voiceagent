import { EventEmitter } from "./event.abstraction";
import {ISTTConfig,ISTTResult,ISTTEventMap, ILLMConfig,IChatContext, ILLMEventMap} from "@/interfaces/abstraction.interface"


export abstract class LLM extends EventEmitter<ILLMEventMap> {
  protected config: ILLMConfig;
  protected isConnected: boolean = false;
  public chatContext: IChatContext[] = [];

  constructor(config: ISTTConfig = {}) {
    super();
    this.config = {}
  }

  async connect(): Promise<void> {this.isConnected = true}
  async disconnect(): Promise<void> {this.isConnected = false}
  public async send(text:string):Promise<void> {};


  // Event types
  static readonly EVENTS = {
    DELTA: "delta",
    RESPONSE: "response",
    FINAL: "final",
  } as const;
}

