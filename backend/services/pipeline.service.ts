import { LLM } from "@shared/abstractions/LLM.abstraction";
import { STT } from "@shared/abstractions/stt.abstraction";
import TTS from "@shared/abstractions/TTS.abstraction";
import { IAudioSend, ICallConfig, IClearAudio } from "@shared/interfaces/abstraction.interface";
import { WebSocket } from "ws";


export class Pipeline {
    protected STT: STT;
    protected LLM: LLM;
    protected TTS: TTS;
    protected connection: WebSocket;

    protected callConfig: ICallConfig;
    constructor(STT: STT, LLM: LLM, TTS: TTS, connection: WebSocket) {
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
            isSpeaking: false,
            isIntrupt: false
        }

        //STT Events listners
        this.STT.on("transcript", (transcription) => {
            this.LLM.send(transcription);
        });

        this.STT.on("intrupt", () => {
            this.clear();
            console.log("Intruption handle");
        });

        //LLM Events listners
        this.LLM.on("delta", (delta) => {
            this.TTS.sendDelta(delta);
        });

        this.LLM.on("final", () => {
            this.TTS.flush();
        });

        this.LLM.on("response", (response) => {
            console.log(`BOT: ${response}`)
        });

        //TSS Events handle
        this.TTS.on('audio', (pcmaudio) => {
            this.sendAudio(pcmaudio);
        })
        this.TTS.sendText("Hello my name is rahul.")

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
}