import { LLM } from "../../shared/abstractions/LLM.abstraction";
import { STT } from "../../shared/abstractions/STT.abstraction";
import TTS from "../../shared/abstractions/TTS.abstraction";
import { IAudioSend, ICallConfig, IClearAudio, IPipeEventMap } from "../../shared/interfaces/abstraction.interface";
import { EventEmitter } from "../../shared/abstractions/event.abstraction";
import { WebSocket } from "ws";
import { callLogger } from './logger/logger.service';


export class Pipeline extends EventEmitter<IPipeEventMap> {
    protected STT: STT;
    protected LLM: LLM;
    protected TTS: TTS;
    protected connection: WebSocket;
    protected callStartTime: Date;
    protected conversationHistory: { speaker: 'user' | 'ai', text: string }[] = [];
    protected callEvents: { type: string, timestamp: string, data?: any }[] = [];

    // Add this new property to store the voice ID
    public voiceId: string = '';

    public callConfig: ICallConfig;

    // Add these as class properties for usage tracking
    protected usageStats = {
        stt: {
            audioSeconds: 0
        },
        tts: {
            characters: 0,
            requests: 0
        },
        llm: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0
        },
        summary: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0
        }
    };

    // Add these properties to the Pipeline class
    protected inactivityTimer: NodeJS.Timeout | null = null;
    protected goodbyeAttempts: number = 0;
    protected callMaxDuration: number = 10 * 60 * 1000; // 10 minutes in milliseconds
    protected callDurationTimer: NodeJS.Timeout | null = null;
    protected conversationState: {
        eligibilityChecked: boolean;
        nextStepsExplained: boolean;
        mainQuestionAnswered: boolean;
    } = {
        eligibilityChecked: false,
        nextStepsExplained: false,
        mainQuestionAnswered: false
    };

    // Add these variables at the class level
    protected lastInterruptTime: number = 0;
    protected interruptSilenceTimer: NodeJS.Timeout | null = null;
    protected consecutiveSilenceChecks: number = 0;
    protected userSpeakingActivity: {timestamp: number, text: string}[] = [];

    // Add these variables to the Pipeline class
    protected lastUserActivityTime: number = 0;
    protected silenceCheckActive: boolean = false;
    protected silenceCheckTimer: NodeJS.Timeout | null = null;

    // Add timing properties
    protected lastUserMessageTime: number = 0;
    protected lastAIResponseTime: number = 0;
    protected lastTTSStartTime: number = 0;
    protected isWebCall: boolean;
    protected conversationTimings: {
        userToAI: number[];
        aiToTTS: number[];
        totalResponse: number[];
        ttsProcessing: number[];
    } = {
        userToAI: [],
        aiToTTS: [],
        totalResponse: [],
        ttsProcessing: []
    };

    constructor(STT: STT, LLM: LLM, TTS: TTS, connection: WebSocket,isWebCall: boolean) {
        super();
        if (!STT) throw new Error("STT is not initialized.");
        if (!LLM) throw new Error("LLM is not initialized.");
        if (!TTS) throw new Error("TTS is not initialized.");

        this.isWebCall = isWebCall;

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

        this.callStartTime = new Date();

        // Track LLM token usage
        this.LLM.on("response", (response) => {
            // Add to conversation history
            this.conversationHistory.push({ speaker: 'ai', text: response });
            
            // Track token usage
            const outputTokens = response.length;
            this.usageStats.llm.outputTokens += outputTokens;
            this.usageStats.llm.totalTokens += outputTokens;
            
            // Check if eligibility was assessed (original checks plus new ones)
            if (response.toLowerCase().includes("you're eligible") || 
                response.toLowerCase().includes("you are eligible") ||
                response.toLowerCase().includes("eligibility criteria") ||
                response.toLowerCase().includes("don't meet the eligibility") ||
                // Hindi eligibility phrases
                response.toLowerCase().includes("eligible हैं") ||
                response.toLowerCase().includes("योग्य हैं") ||
                response.toLowerCase().includes("अच्छे फिट हैं")) {
                this.conversationState.eligibilityChecked = true;
                console.log("Eligibility has been checked.");
            }
            
            // Check if next steps were explained (original checks plus new ones)
            if (response.toLowerCase().includes("counselor will call") || 
                response.toLowerCase().includes("will call you") ||
                response.toLowerCase().includes("within 30 minutes") ||
                response.toLowerCase().includes("get back to you") ||
                // Hindi next steps phrases
                response.toLowerCase().includes("30 मिनट") ||
                response.toLowerCase().includes("संपर्क करेगा") ||
                response.toLowerCase().includes("काउंसलर")) {
                this.conversationState.nextStepsExplained = true;
                console.log("Next steps have been explained.");
            }
            
            // Check if specific phrases indicate a conclusive answer was given
            if (response.toLowerCase().includes("thank you for your interest") ||
                response.toLowerCase().includes("have a great day") ||
                (response.toLowerCase().includes("any other") && response.toLowerCase().includes("questions")) ||
                // Hindi farewell phrases
                response.toLowerCase().includes("धन्यवाद") ||
                response.toLowerCase().includes("अच्छा दिन")) {
                this.conversationState.mainQuestionAnswered = true;
                console.log("Main question appears to have been answered.");
            }
            
            this.emit('assistant', response);
        });

        // When an interruption is detected, set a timer to resume if silence follows
        this.STT.on("intrupt", () => {
            // Only process interruptions if we're not already ending the call
            if (this.callConfig.isSpeaking == true && !this.callConfig.endingCall) {
                this.clear();
                this.callConfig.isSpeaking = false;
                this.TTS.clear();
                this.emit('intrupt','');
                
                // Log the interruption event
                this.callEvents.push({
                    type: 'interruption_detected',
                    timestamp: new Date().toISOString()
                });
                console.log("Interrupt detected");
                
                // Update the last user activity time
                this.lastUserActivityTime = Date.now();
                
                // Start the silence check if not already running
                if (!this.silenceCheckActive) {
                    this.startSilenceCheck();
                }
            } else if (this.callConfig.endingCall) {
                // Log but ignore interruptions during farewell
                console.log("Ignoring interruption during farewell");
            }
        });

        // When user speaks, clear the silence timer
        this.STT.on("transcript", (transcription) => {
            // Reset inactivity timer whenever user speaks
            this.resetInactivityTimer();
            
            // Update the last user activity time
            this.lastUserActivityTime = Date.now();
            
            if (this.callConfig.isSpeaking == false) this.callConfig.isSpeaking = true;
            
            // Add to conversation history
            this.conversationHistory.push({ speaker: 'user', text: transcription });
            
            // Check for farewell phrases
            const farewellPhrases = ['bye', 'goodbye', 'bye bye', 'hang up', 'end call', 'thank you'];
            const isFarewell = farewellPhrases.some(phrase =>
                transcription.toLowerCase().includes(phrase.toLowerCase())
            );

            if (isFarewell && !this.callConfig.endingCall) {
                console.log("User said goodbye, ending call");
                this.endCall();
            } else {
                // Track token usage for LLM input - count actual characters
                const inputTokens = transcription.length;
                this.usageStats.llm.inputTokens += inputTokens;
                this.usageStats.llm.totalTokens += inputTokens;
                
                this.LLM.send(transcription);
                this.emit("transcript", transcription);
            }
            
            // If the user says "yes" or "ok" after objectives have been met, it's a good time to end
            if (this.conversationState.eligibilityChecked && 
                this.conversationState.nextStepsExplained &&
                (transcription.toLowerCase().includes("ok") || 
                 transcription.toLowerCase().includes("yes") ||
                 transcription.toLowerCase().includes("thank") ||
                 transcription.toLowerCase().includes("alright"))) {
                console.log("User acknowledged completion. Good time to end call.");
                setTimeout(() => {
                    if (!this.callConfig.endingCall) {
                        this.endCall("Great! Thank you for your time today. Our counselor will be in touch soon. Goodbye!");
                    }
                }, 500);
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

        //TSS Events handle
        this.TTS.on('audio', (pcmaudio) => {
            if(this.callConfig.isSpeaking == true){
                this.sendAudio(pcmaudio);
            }
        });

        // Add this to the constructor, after the TTS.on('audio'...) section
        this.TTS.on('characters', (charCount) => {
            // Track TTS character usage
            this.usageStats.tts.characters += charCount;
            this.usageStats.tts.requests += 1;
        });

        // this.TTS.sendText("Hello, this is Dr. AI, how can I help you today?")

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
            
            // Clear all timers
            if (this.inactivityTimer) {
                clearTimeout(this.inactivityTimer);
                this.inactivityTimer = null;
            }
            
            if (this.callDurationTimer) {
                clearTimeout(this.callDurationTimer);
                this.callDurationTimer = null;
            }
            
            // Generate summary when connection closes
            // Only generate if we have enough conversation data
            if (this.conversationHistory && this.conversationHistory.length > 1) {
                await this.generateCallSummary();
            }
            
            this.STT.disconnect();
        }

        // Track more events as needed...
        // For example, you could track call start, speech start/end, etc.
        this.callEvents.push({
            type: 'call_started',
            timestamp: new Date().toISOString()
        });

        // Set a maximum call duration
        this.callDurationTimer = setTimeout(() => {
            console.log("Maximum call duration reached. Ending call.");
            this.endCall("I notice we've been talking for a while. Thank you for your time today. Goodbye!");
        }, this.callMaxDuration);
        
        // Track when the AI finishes speaking to start inactivity timer
        this.TTS.on('audio', () => {
            // Reset any existing inactivity timer when new audio is sent
            this.resetInactivityTimer();
        });
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

    public setOutboundMode(): void {
        // Flag to indicate this is an outbound call
        this.callConfig.direction = 'outbound';
        
        // Clear any default greeting
        this.TTS.clear();
        
        // Skip the default intro message
        this.callConfig.customGreeting = true;
    }

    public endCall(message: string = "Thanks. Goodbye!"): void {
        if (this.callConfig.endingCall) {
            console.log("Call already ending, ignoring duplicate end request");
            return;
        }
        
        console.log(`Ending call with message: "${message}"`);
        this.callConfig.endingCall = true;
        
        // Clear any existing inactivity timer
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
        
        // Speak the farewell message
        this.TTS.sendText(message);
        
        // Add a timer to close the connection after TTS is likely finished
        setTimeout(() => {
            console.log("Closing connection after farewell message");
            this.emit('connectionClose', "Call ended after farewell message");
        }, 7000); // 7 seconds is enough for the short goodbye message
    }

    public async generateCallSummary(): Promise<void> {
        try {
            // Skip summary if conversation is too short
            if (this.conversationHistory.length < 2) {
                console.log('Call too short for summary');
                this.calculateUsage(); // Still calculate usage
                this.printUsageReport(); // Print usage report
                return;
            }
            
            const callDuration = Math.round((new Date().getTime() - this.callStartTime.getTime()) / 1000);
            const minutes = Math.floor(callDuration / 60);
            const seconds = callDuration % 60;
            const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Format conversation for summary prompt
            const conversationText = this.conversationHistory
                .map(msg => `${msg.speaker.toUpperCase()}: ${msg.text}`)
                .join('\n');
            
            // Create a summary prompt for the LLM
            const summaryPrompt = `
              Please provide a brief summary of the following conversation between a customer service agent (AI) and a customer (USER).
              Focus on the main points, customer's interest level, and any next steps.
              Format your response as:
              - Outcome: (interested/not interested/undecided)
              - Key Points: (brief bullet list of main discussion points)
              - Next Steps: (if any)
              
              Conversation:
              ${conversationText}
            `;
            
            // Track summary input tokens
            this.usageStats.summary.inputTokens = this.estimateTokenCount(summaryPrompt);
            this.usageStats.summary.totalTokens += this.usageStats.summary.inputTokens;
            
            // Use OpenAI API directly for summary with gpt-4o-mini
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a call summarization assistant.' },
                        { role: 'user', content: summaryPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 300
                })
            });
            
            const result = await response.json();
            const summary = result.choices[0].message.content;
            
            // Track summary output tokens
            this.usageStats.summary.outputTokens = this.estimateTokenCount(summary);
            this.usageStats.summary.totalTokens += this.usageStats.summary.outputTokens;
            
            // Calculate overall usage
            this.calculateUsage();
            
            // Calculate combined character usage
            const totalChars = this.usageStats.llm.totalTokens + this.usageStats.summary.totalTokens;
            
            // Print call summary
            console.log('\n========== CALL SUMMARY ==========');
            console.log(`Call Type: ${this.callConfig.direction === 'outbound' ? 'Outbound' : 'Inbound'}`);
            console.log(`Duration: ${durationStr}`);
            console.log('\n' + summary);
            
            
            // Print usage report
            this.printUsageReport();
            
            // Before ending the method, add this to record call ended event
            this.callEvents.push({
                type: 'call_ended',
                timestamp: new Date().toISOString()
            });
            
            // Log the summary to the call-summaries.log file using our logger
            callLogger.logCallSummary({
                timestamp: new Date().toISOString(),
                callType: this.callConfig.direction === 'outbound' ? 'Outbound' : 'Inbound',
                duration: durationStr,
                summary: summary,
                conversation: this.conversationHistory,
                events: this.callEvents,
                voiceId: this.voiceId,
                timingStats: {
                    avgUserToAI: this.conversationTimings.userToAI.reduce((a, b) => a + b, 0) / this.conversationTimings.userToAI.length,
                    avgAIToTTS: this.conversationTimings.aiToTTS.reduce((a, b) => a + b, 0) / this.conversationTimings.aiToTTS.length,
                    avgTotalResponse: this.conversationTimings.totalResponse.reduce((a, b) => a + b, 0) / this.conversationTimings.totalResponse.length,
                    exchanges: this.conversationTimings.userToAI.map((time, index) => ({
                        userToAI: time,
                        aiToTTS: this.conversationTimings.aiToTTS[index],
                        total: this.conversationTimings.totalResponse[index]
                    }))
                },
                usageStats: {
                    stt: { audioSeconds: this.usageStats.stt.audioSeconds },
                    tts: { 
                        characters: this.usageStats.tts.characters, 
                        requests: this.usageStats.tts.requests 
                    },
                    llm: { 
                        inputTokens: this.usageStats.llm.inputTokens,
                        outputTokens: this.usageStats.llm.outputTokens,
                        totalTokens: this.usageStats.llm.totalTokens
                    },
                    summary: {
                        inputTokens: this.usageStats.summary.inputTokens,
                        outputTokens: this.usageStats.summary.outputTokens,
                        totalTokens: this.usageStats.summary.totalTokens
                    },
                    totalChars: totalChars
                }
            });
            
        } catch (error) {
            console.error('Error generating call summary:', error);
            
            // Still try to calculate and show usage even if summary fails
            this.calculateUsage();
            this.printUsageReport();
        }
    }

    // Add this method to calculate token count (simplified estimation)
    protected estimateTokenCount(text: string): number {
        // GPT models use roughly ~4 chars per token on average for English text
        return Math.ceil(text.length / 4);
    }

    // Add a method to calculate final usage stats
    public calculateUsage(): void {
        // Calculate STT audio duration
        const callDurationSeconds = (new Date().getTime() - this.callStartTime.getTime()) / 1000;
        // Assume 50% of the call is user speaking time (typical for agent calls)
        this.usageStats.stt.audioSeconds = callDurationSeconds * 0.5;
    }

    // Add method to print usage report
    private printUsageReport(): void {
        console.log('\n========== USAGE REPORT ==========');
        
        console.log(`Speech-to-Text (Deepgram):`);
        console.log(`- Audio Duration: ${this.usageStats.stt.audioSeconds.toFixed(1)} seconds`);
        console.log(`- Characters In: ${this.usageStats.llm.inputTokens.toLocaleString()}`);
        console.log(`- Model: nova-3`);
        
        console.log(`\nText-to-Speech (VoiceMaker):`);
        console.log(`- Characters: ${this.usageStats.tts.characters.toLocaleString()}`);
        console.log(`- API Requests: ${this.usageStats.tts.requests}`);
        
        console.log(`\nLLM (GPT-4.1-Nano):`);
        console.log(`- Characters In: ${this.usageStats.llm.inputTokens.toLocaleString()}`);
        console.log(`- Characters Out: ${this.usageStats.llm.outputTokens.toLocaleString()}`);
        console.log(`- Total Characters: ${this.usageStats.llm.totalTokens.toLocaleString()}`);
        
        console.log(`\nSummary (GPT-4o-Mini):`);
        console.log(`- Characters In: ${this.usageStats.summary.inputTokens.toLocaleString()}`);
        console.log(`- Characters Out: ${this.usageStats.summary.outputTokens.toLocaleString()}`);
        console.log(`- Total Characters: ${this.usageStats.summary.totalTokens.toLocaleString()}`);
        
        // Calculate combined character usage
        const totalChars = this.usageStats.llm.totalTokens + this.usageStats.summary.totalTokens;
        console.log(`\nCOMBINED CHARACTER USAGE: ${totalChars.toLocaleString()}`);
        console.log('===================================\n');
    }

    // Add these methods to manage timers and call termination
    private resetInactivityTimer(): void {
        // Don't reset timer if call is already ending
        // if (this.callConfig.endingCall) return;
        
        // // Clear any existing timer
        // if (this.inactivityTimer) {
        //     clearTimeout(this.inactivityTimer);
        //     this.inactivityTimer = null;
        // }
        
        // // Set a new inactivity timer (20 seconds of silence)
        // this.inactivityTimer = setTimeout(() => {
        //     // Double-check we're still not ending
        //     if (!this.callConfig.endingCall) {
        //         console.log("User inactivity detected. Ending call.");
        //         this.endCall("Since I haven't heard from you for a while, I'll end our call now. Thank you for your time. Goodbye!");
        //     }
        // }, 20000);
        return;
    }

    // Add these methods to the Pipeline class
    private startSilenceCheck(): void {
        this.silenceCheckActive = true;
        
        // Increase this timeout from 5000ms to 15000ms (15 seconds)
        setTimeout(() => {
            const silenceDuration = Date.now() - this.lastUserActivityTime;
            
            // Only consider it silence if it's been quiet for more than 15 seconds
            if (silenceDuration > 15000 && !this.callConfig.endingCall) {
                console.log(`Silence detected after interruption (${silenceDuration}ms), resuming conversation`);
                this.callConfig.isSpeaking = true;
                
                // Just set the speaking flag back to true
                // No need to call any special methods
                
                this.silenceCheckActive = false;
            } else {
                this.silenceCheckActive = false;
            }
        }, 15000); // Change from 5000ms to 15000ms
    }

    // Add timing statistics method
    

    static readonly EVENTS = {
        TRANSCRIPT: "transcript",
        INTRUPT: "intrupt",
        assistant: "assistant",
    } as const;
}