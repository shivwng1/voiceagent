import wav from "wavefile";
import TTS from "@shared/abstractions/TTS.abstraction.js";
import { ITTSConfig } from "@shared/interfaces/abstraction.interface";
import { ChunkedSentenceStream } from "@shared/abstractions/sentence.abstranction";

export default class VoiceMakerTTS extends TTS {
    protected chunksSentenceStream: ChunkedSentenceStream;
    constructor(config: ITTSConfig) {
        if (!config.apiKey) throw new Error("VoiceMaker API key missing.");
        super(config);
        this.name = "VoiceMakerTTS";
        this.chunksSentenceStream = new ChunkedSentenceStream();
        this.chunksSentenceStream.on('sentence', (sentence) => {
            this.sendText(sentence);
        });
    }

    public async getAudio(text: string): Promise<void> {
        console.log("Fetching  ---> ", text);
        console.time("@TTS VoiceMaker fetch time " + text);

        const response = await fetch("https://developer.voicemaker.in/voice/api", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.config.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                Engine: "neural",
                VoiceId: this.config.voice_id || "ai3-Jony",
                LanguageCode: this.config.language || "en-IN",
                Text: text,
                OutputFormat: "wav",
                ResponseType: "stream",
                SampleRate: 16000,
                Effect: "default",
                MasterVolume: this.config.loadness || 0,
                MasterSpeed: this.config.speed || 0,
                MasterPitch: this.config.pitch || 0,
            }),
        });

        try {
            const wavBuffer = Buffer.from(await response.arrayBuffer());
            console.timeEnd("@TTS VoiceMaker fetch time " + text);

            const wavFile = new wav.WaveFile(new Uint8Array(wavBuffer));

            // @ts-ignore
            const pcmSamples = wavFile.data.samples;
            const pcmBase64 = Buffer.from(pcmSamples).toString("base64");

            this.emit("audio", pcmBase64);
        } catch (error) {
            console.error("Error fetching VoiceMaker TTS", (error as Error)?.message);
        }
    }

    sendText(text: string): void {
        this.getAudio(text);
    }

    sendDelta(delta: string, isFinal: boolean = false): void {
        this.chunksSentenceStream.pushDelta(delta as string, isFinal);
    }

    flush(): void {
        this.sendDelta('', true);
    }
}
