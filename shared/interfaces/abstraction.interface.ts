import { TCallEvent } from "@/types/call.types";
import { TOpenaiRole, TOpenaiStreamResponse } from "@/types/openai.types";

export interface ISTTConfig {
  language?: string;
  model?: string;
  smart_format?: boolean;
  encoding?: string;
}

export interface ILLMConfig {
  token?: number;
  model?: string;
  temperature?: number;
  stream?: boolean;
  apiKey?: string;
  prompt?: string;
  base_url?: string;
}

export interface ISTTResult {
  transcript: string;
  confidence?: number;
  isFinal: boolean;
}

// Define the event map interface
export interface ISTTEventMap {
  transcript: string;
  error: string;
  intrupt: string;
}

export interface ILLMEventMap {
  delta: string;
  response: string;
  final: string;
}
export interface IPipeEventMap {
  transcript: string;
  intrupt: string;
  assistant: string;
  endCall: string;
  connectionClose: string;
}

export interface ITTSEvents {
  audio: (audio: string) => void;
  close: (error: Error | null) => void;
  characters: (charCount: number) => void;
}


export interface IChatContext {
  role: TOpenaiRole;
  content: string;
}


export interface IOpenStreamEventResponse {
  type: TOpenaiStreamResponse;
  output_index?: number;
  content_index?: number;
  delta?: string;
  text?: string;
}


export interface ITTSConfig {
  speed?: number;
  voice_id?: string;
  loadness?: number;
  language?: string;
  temprature?: number;
  apiKey: string;
  pitch?: number;
  isWebCall?: boolean;
}


export interface ICallConfig {
  isWebCall?: boolean;
  direction?: 'outbound' | 'inbound';
  isSpeaking?: boolean;
  isIntrupt?: boolean;
  streamSid?: string;
  customGreeting?: boolean;
  endingCall?: boolean;
}


export interface IAudioSend {
  event: TCallEvent,
  streamSid: string,
  media: {
    payload: string,
  },
}

export interface IClearAudio {
  event: TCallEvent,
  streamSid: string
}

export interface INoiseReducerOptions {
  sampleRate?: number;
  channels?: number;
  inputFormat?: string;
  outputFormat?: string;
  model?: string;
  modelPath?: string;
}