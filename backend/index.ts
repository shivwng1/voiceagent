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
import TWILIOService from "./services/twilio.service";
import cors from 'cors'
import { TCallType } from "@shared/types/call.types";

const PORT = process.env.PORT || 4000;
const twilio = new TWILIOService();

// Initialize express and express-ws together
const app = express() as unknown as Application;
app.use(express.json());
app.use(express.urlencoded());
app.use(cors({
  origin: '*'
}))
expressWs(app);

// Testing root
app.get("/", (req: Request, res: Response) => {
  res.send("Working...");
});

app.post("/outbound", async (req: Request, res: Response) => {
  try {
    const {phone} = req.body;
    const streamURL = `${(process.env.SERVER_URL as string).replace("https","wss")}/media-stream/telephone?isWebCall=false&amp;phone=${phone}`
    const callSID = await twilio.createCall(phone,streamURL);
    res.status(200).json({
      success: true,
      callSID,
      message: "call created successfully."
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    })
  }
});



app.all("/incoming", (req: Request, res: Response) => {
  const phone = req.body?.Called;
  console.log("incoming-call:",phone);
  const stream_url = `${(process.env.SERVER_URL as string).replace("https","wss")}/media-stream?isWebCall=true&amp;phone=${phone}`
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Connect>
            <Stream url="${stream_url}" />
        </Connect>
        <Say>Have a great day Goodbye!</Say>
    </Response>
  `;
  res.type('text/xml').send(twimlResponse);
});

// WebSocket route
app.ws("/media-stream/:call_type", (ws: WebSocket, req: Request) => {
  console.log("WebSocket connection opened");
  try {


    const call_type:TCallType = req.params.call_type as TCallType;
    const isWebCall = call_type == "web";
    const system_prompt = `
      You are credits cards selling assistant and your work to sells are credits using your skills.
    `

  
    
    const STT = new DeepgramSTT({ model: 'nova-3', language: 'multi',encoding: !isWebCall ? "mulaw" : undefined });
    const LLM = new OpenAiLLM({ apiKey: process.env.OPENAI_API_KEY, prompt: system_prompt, model: 'gpt-4o' });
    const TTS = new VoiceMakerTTS({ apiKey: process.env.VOICEMAKER_API_KEY as string, language: 'hi-IN', voice_id: 'proplus-Nishant', speed: 10, loadness: 10,isWebCall })
    // const TTS = new SarvamTTS({ apiKey: process.env.SARVAM_API_KEY as string, voice_id: 'diya',isWebCall })

    const pipeline = new Pipeline(STT, LLM, TTS, ws);
    pipeline.on('transcript', (transcript) => {
      console.log(`@User ---> ${transcript}`);
    });

    pipeline.on('intrupt', () => {
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
