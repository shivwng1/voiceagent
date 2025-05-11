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
import { OpenRouterLLM } from "./services/openrouter/openrouter.llm";
import { DEFAULT_PROMPT } from "./constant/config.constant";
import { getRandomVoice } from "./utilty/getRandonVoice";
const PORT = process.env.PORT || 4000;
const twilio = new TWILIOService();
const session = new Map<string,string>();

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
    const {phone,prompt} = req.body;

    if(prompt){
      session.set(phone,prompt);
    }

    const streamURL = `${(process.env.SERVER_URL as string).replace("https","wss")}/media-stream/telephone/${phone}`
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
  const stream_url = `${(process.env.SERVER_URL as string).replace("https","wss")}/media-stream/telephone/${phone}`
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
app.ws("/media-stream/:call_type/:phone", (ws: WebSocket, req: Request) => {
  console.log("WebSocket connection opened");
  try {

    const phone = req.params.phone;
    const call_type:TCallType = req.params.call_type as TCallType;

    const prompt = session.get(phone);
    const isWebCall = call_type == "web";

    let system_prompt = "";
    if(!isWebCall && prompt){
      system_prompt = prompt;
    }else if(!isWebCall){
      system_prompt = DEFAULT_PROMPT;
    }else{
      system_prompt = `
        You are a credit cards selling assistant and your work is to sell credit cards using your skills.
        You're handling an inbound call, so someone has reached out to you for information.
      `;
    }

  
    
    const STT = new DeepgramSTT({ model: 'nova-3', language: 'multi',encoding: !isWebCall ? "mulaw" : undefined });
    // const LLM = new OpenAiLLM({ apiKey: process.env.OPENAI_API_KEY, prompt: system_prompt, model: 'gpt-4o' });

    const LLM = new OpenRouterLLM({
      apiKey: process.env.OPEN_ROUTER_END,
      prompt: system_prompt,
      model: "openai/gpt-4.1-nano",
      temperature: 0.7,
      stream: true
    });

    const TTS = new VoiceMakerTTS({ apiKey: process.env.VOICEMAKER_API_KEY as string, language: 'hi-IN', voice_id: 'proplus-Nishant', speed: 10, loadness: 10,isWebCall })
    // const TTS = new SarvamTTS({ apiKey: process.env.SARVAM_API_KEY as string, voice_id: getRandomVoice(), isWebCall })

    const pipeline = new Pipeline(STT, LLM, TTS, ws,isWebCall);


    const selectedVoice = getRandomVoice();

    pipeline.voiceId = selectedVoice; // We'll add this property to the Pipeline class

    if (!isWebCall) {
      pipeline.setOutboundMode();
    }
    
    TTS.sendText("Hello");


    pipeline.on('transcript', (transcript) => {
      console.log(`@User ---> ${transcript}`);
    });

    pipeline.on('intrupt', () => {
      console.log(`Intruppted`);
    });


    pipeline.on('assistant', (response) => {
      console.log(`@AI ---> ${response}`);
    });

    // Add WebSocket error handling
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', (code, reason) => {
      console.log(`WebSocket closed with code ${code} and reason: ${reason}`);
      STT.disconnect();
    });

    // Add a keep-alive ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 5000);

    // Track TTS activity with a more robust approach
    let lastTtsActivity = Date.now();
    let isSpeakingFarewell = false;

    // When TTS emits audio, just track activity time
    TTS.on('audio', (audio) => {
      lastTtsActivity = Date.now();

      // If you want to track that we're in farewell mode (for logging purposes only)
      if (pipeline.callConfig.endingCall) {
        isSpeakingFarewell = true;
      }
    });

    // Replace the existing STT.on("transcript") block with this:
    STT.on("transcript", async (transcript) => {
      // Enhanced list of farewell phrases in both English and Hindi
      const farewellPhrases = [
        // English phrases
        'bye', 'goodbye', 'bye bye', 'hang up', 'end call', 'thank', 'thanks', 'ok thanks',
        'see you', 'take care', 'talk to you later', 'good day',

        // Hindi/Hinglish phrases
        'धन्यवाद', 'अलविदा', 'फिर मिलेंगे', 'अच्छा', 'ठीक है', 'ठीक', 'namaste', 'ok', 'ok bye'
      ];

      // More accurate detection using word boundaries to avoid false positives
      const isFarewell = farewellPhrases.some(phrase => {
        // Create a regex pattern with word boundaries for more accurate matching
        const pattern = new RegExp(`\\b${phrase}\\b`, 'i');
        return pattern.test(transcript.toLowerCase());
      });

      if (isFarewell && !pipeline.callConfig.endingCall) {
        console.log("User said farewell phrase, ending call");
        pipeline.endCall("Thanks for your time. Have a good day!");
      }
    });

    // Add this handler for the connectionClose event
    pipeline.on('connectionClose', (reason) => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log(`Closing WebSocket: ${reason}`);
        ws.close(1000, reason);
      }
    });

  } catch (error) {
    console.log(error);
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
