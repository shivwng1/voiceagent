import wav from "wavefile";
import TTS from "@shared/abstractions/TTS.abstraction.js";
import { ITTSConfig } from "@shared/interfaces/abstraction.interface";
import { ChunkedSentenceStream } from "@shared/abstractions/sentence.abstranction";


export default class SarvamTTS extends TTS {
    protected chunksSentenceStream: ChunkedSentenceStream;
    protected bufferSentences: string[] = []
    protected generatingAudio: boolean = false;
    constructor(config: ITTSConfig) {
        if(!config.apiKey) throw new Error("Servamai API key missing.");
        super(config);
        this.name = "SarvamTTS";
        this.chunksSentenceStream = new ChunkedSentenceStream();
        this.chunksSentenceStream.on('sentence',(sentence) => {
            this.sendText(sentence);
        });
    }

    public async getAudio(text: string): Promise<void> {
        console.log("Fetching  ---> ", text);
        console.time("@TTS Sarvam fetch time " + text);
        const response = await fetch("https://api.sarvam.ai/text-to-speech", {
            method: "POST",
            headers: {
                "api-subscription-key": this.config.apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                inputs: [text],
                target_language_code: this.config.language || "hi-IN",
                speaker: this.config.voice_id || "meera",
                pitch: this.config.pitch || 0,
                pace: this.config.speed || 1,
                loudness: this.config.loadness || 1.2,
                speech_sample_rate: this.config.isWebCall ? 16000 : 8000,
                enable_preprocessing: true,
                model: "bulbul:v2",
            }),
        });

        try {
            const data = await response.json();
            console.timeEnd("@TTS Sarvam fetch time " + text);
            let base64;
            try {
                base64 = data?.audios[0];
            } catch (error) {
                console.error("Error in SarvamTTS response", data, text);
            }

            const wavBuffer = Buffer.from(base64, "base64");
            const wavFile = new wav.WaveFile(new Uint8Array(wavBuffer));

            if(!this.config.isWebCall){
                wavFile.toMuLaw()
            }
            // @ts-ignore
            const pcmSamples = wavFile.data.samples;
            const pcmBase64 = Buffer.from(pcmSamples).toString("base64");
            this.emit("audio",pcmBase64);

        } catch (error) {
            console.log((error as Error)?.message);
        }
    }

    sendText(text: string): void {
        this.bufferSentences.push(text);
        if(this.generatingAudio == false){
            this.generatingAudio = true;
            this.QuePusher();
        }
    }

    async QuePusher():Promise<void> {
        while (this.bufferSentences.length != 0){
            const sentence = this.bufferSentences.shift();
            await this.getAudio(sentence as string)
        }

        this.generatingAudio = false;
    }

    sendDelta(delta: string, isFinal: boolean=false): void {
        this.chunksSentenceStream.pushDelta(delta as string,isFinal)
    }

    flush(): void {
        this.sendDelta('',true);
    }

    clear(): void {
        this.chunksSentenceStream.clear();
        this.bufferSentences = [];
        this.generatingAudio = false;
    }
}