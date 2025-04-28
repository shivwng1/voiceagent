import { LLM } from "@shared/abstractions/LLM.abstraction";
import { STT } from "@shared/abstractions/stt.abstraction";
import TTS from "@shared/abstractions/TTS.abstraction";
import { IAudioSend, ICallConfig, IClearAudio, IPipeEventMap } from "@shared/interfaces/abstraction.interface";
import { EventEmitter } from "@shared/abstractions/event.abstraction";
import { WebSocket } from "ws";


export class Pipeline extends EventEmitter<IPipeEventMap> {
    protected STT: STT;
    protected LLM: LLM;
    protected TTS: TTS;
    protected connection: WebSocket;

    protected callConfig: ICallConfig;
    constructor(STT: STT, LLM: LLM, TTS: TTS, connection: WebSocket) {
        super();
        if (!STT) throw new Error("STT is not initialized.");
        if (!LLM) throw new Error("LLM is not initialized.");
        if (!TTS) throw new Error("TTS is not initialized.");


        this.STT = STT;
        this.LLM = LLM;
        this.TTS = TTS;
        this.connection = connection;

        this.STT.connect();
        this.LLM.connect();
        this.TTS.connect();

        this.callConfig = {
            isSpeaking: true,
            isIntrupt: false
        }

        //STT Events listners
        this.STT.on("transcript", (transcription) => {
            if (this.callConfig.isSpeaking == false) this.callConfig.isSpeaking = true;
            this.LLM.send(transcription);
            this.emit("transcript",transcription);
        });

        this.STT.on("intrupt", () => {
            if (this.callConfig.isSpeaking == true) {
                this.clear();

                this.callConfig.isSpeaking = false;
                this.TTS.clear();
                this.emit('intrupt','');
            }
        });

        //LLM Events listners
        this.LLM.on("delta", (delta) => {
            if(this.callConfig.isSpeaking == true){
                this.TTS.sendDelta(delta);
            }
        });

        this.LLM.on("final", () => {
            this.TTS.flush();
        });

        this.LLM.on("response", (response) => {
            this.emit('assistant',response);
        });

        //TSS Events handle
        this.TTS.on('audio', (pcmaudio) => {
            if(this.callConfig.isSpeaking == true){
                this.sendAudio(pcmaudio);
            }
        });

        this.TTS.sendText("Hello, this is Dr. AI, how can I help you today?")

        //call events
        connection.onmessage = async (message) => {
            try {
                //@ts-ignore
                const data = JSON.parse(message.data);
                switch (data.event) {
                    case 'start':
                        console.log('Starting transcription...');
                        this.callConfig.streamSid = data?.start?.streamSid
                        break;
                    case 'media':
                        this.STT.send(data.media.payload);
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        }

        connection.onclose = async () => {
            console.log(`Client disconnected`);
            this.STT.disconnect();
        }
    }

    sendAudio(audio: string) {
        const meesage: IAudioSend = {
            event: "media",
            media: {
                payload: audio
            },
            streamSid: this.callConfig.streamSid as string
        }
        this.connection.send(JSON.stringify(meesage))
    }

    clear() {
        const meesage: IClearAudio = {
            event: "clear",
            streamSid: this.callConfig.streamSid as string
        }
        this.connection.send(JSON.stringify(meesage))
    }


    static readonly EVENTS = {
        TRANSCRIPT: "transcript",
        INTRUPT: "intrupt",
        assistant: "assistant",
    } as const;
}