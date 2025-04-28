import { EventEmitter } from "@shared/abstractions/event.abstraction";
import { ISTTConfig, ISTTEventMap, ISTTResult } from "@shared/interfaces/abstraction.interface";
import WebSocket from "ws";
import { Buffer } from "node:buffer";
import { STT } from "@shared/abstractions/stt.abstraction";

export class DeepgramSTT extends STT {
  private socket?: WebSocket;
  private text: string = '';

  constructor(config: ISTTConfig = {}) {
    super({
      language: config.language || "en-IN",
      smart_format: true,
      ...config,
    });
    this.name = "Deepgram STT";
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    const queryParams = new URLSearchParams({
      model: this.config.model || "nova-2-phonecall",
      language: this.config.language || "en-IN",
      smart_format: String(this.config.smart_format ?? true),
      sample_rate: "8000",
      channels: "1",
      multichannel: "false",
      no_delay: "true",
      interim_results: "true",
      endpointing:"300"
    });

    if(this.config.encoding) queryParams.append('encoding',this.config.encoding);
    this.socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${queryParams.toString()}`, [
      "token",
      process.env.DEEPGRAM_API_KEY as string,
    ]);

    this.socket.onopen = () => {
      this.isConnected = true;
      console.log({ event: "Deepgram WebSocket Opened" });
    };

    this.socket.onmessage = (message) => {
      const received = JSON.parse(message.data.toString());

      if (!received?.channel?.alternatives) return;

      const transcript = received.channel.alternatives[0]?.transcript;
      if (transcript) {
        this.text += transcript
        this.emit(STT.EVENTS.INTRUPT,'')
        console.log("Interrupt detected");
      }

      if (transcript && received.speech_final) {
        this.emit(STT.EVENTS.TRANSCRIPT, this.text);
        this.text = '';
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      console.log({ event: "Deepgram WebSocket Closed" });
    };

    this.socket.onerror = (error) => {
      this.isConnected = false;
      console.error({ event: "Deepgram WebSocket Error", error });
      //@ts-ignore
      this.emit(STT.EVENTS.ERROR, error);
    };
  }

  async disconnect(): Promise<void> {
    if (this.socket && this.isConnected) {
      this.socket.close();
      this.isConnected = false;
    }
  }

  async send(audioData: string | Buffer): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      let payload: Buffer;

      if (audioData instanceof Buffer) {
        payload = audioData;
      } else {
        payload = Buffer.from(audioData as string, 'base64');
      }
      this.socket.send(payload);
    }
  }

  isReady(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
