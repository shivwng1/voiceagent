import express, { Request, Response } from "express";
import expressWs from "express-ws";
import { Application } from "express-ws";
import { WebSocket } from "ws";
import "dotenv/config";
import { Pipeline } from "@/services/pipeline.service";
import { DeepgramSTT } from "@/services/deepgram/deepgram.stt";
import { OpenAiLLM } from "@/services/openai/openai.llm";
import SarvamTTS from "@/services/sarvam/sarvam.tts";
import VoiceMakerTTS from "@/services/voicemaker/voicemaker.tts";

const PORT = process.env.PORT || 4000;

// Initialize express and express-ws together
const app = express() as unknown as Application;
expressWs(app);

// Testing root
app.get("/", (req: Request, res: Response) => {
  res.send("Working...");
});

// WebSocket route
app.ws("/media-stream", (ws: WebSocket, req: Request) => {
  console.log("WebSocket connection opened");
  try {

    const system_prompt = `
      You are credits cards selling assistant and your work to sells are credits using your skills.
    `
    const STT = new DeepgramSTT({ model: 'nova-3', language: 'multi' });
    const LLM = new OpenAiLLM({ apiKey: process.env.OPENAI_API_KEY, prompt: system_prompt,model: 'gpt-4o' });
    const TTS = new VoiceMakerTTS({ apiKey: process.env.VOICEMAKER_API_KEY as string,language: 'hi-IN', voice_id: 'ai2-hi-IN-Nikhil',speed: 15,loadness: 10 })
    // const TTS = new SarvamTTS({ apiKey: process.env.SARVAM_API_KEY as string, voice_id: 'diya' })

    const pipeline = new Pipeline(STT, LLM, TTS, ws);
    pipeline.on('transcript',(transcript) => {
      console.log(`@User ---> ${transcript}`);
    });

    pipeline.on('intrupt',() => {
      console.log(`Intruppted`);
    });

  } catch (error) {
    console.log(error);
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
