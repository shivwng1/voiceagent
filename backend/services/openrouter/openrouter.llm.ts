import { LLM } from "../../../shared/abstractions/LLM.abstraction";
import { IChatContext, ILLMConfig, IOpenStreamEventResponse } from "../../../shared/interfaces/abstraction.interface";
import { OpenAI } from "openai";

export class OpenRouterLLM extends LLM {
    protected config: ILLMConfig;
    public chatContext: IChatContext[];
    protected openaiClient: OpenAI;

    constructor(config: ILLMConfig) {
        super();
        this.config = {
            stream: true,
            token: 150,
            model: 'google/gemini-2.0-flash-lite-001', //model to use apart from 2.0 i.e gemini-1.5-flash-8b
            temperature: 0.7,
            prompt: config.prompt || "You are a helpful assistant",
            base_url: "https://openrouter.ai/api/v1",
            ...config
        }; 
        
        // Log initialization parameters
        console.log("Initializing OpenRouterLLM with:", {
            model: this.config.model,
            baseURL: this.config.base_url,
            streamEnabled: this.config.stream
        });
        
        // Initialize OpenAI client with OpenRouter base URL
        this.openaiClient = new OpenAI({
            apiKey: this.config.apiKey,
            baseURL: this.config.base_url,
            defaultHeaders: {
                'HTTP-Referer': 'https://yourwebsite.com',  // Required by OpenRouter
                'X-Title': 'Voice Agent Application'        // Optional for OpenRouter
            }
        });
        
        this.chatContext = [{
            role: "system",
            content: this.config.prompt || "You are a helpful assistant"
        }];
    }

    async send(text: string): Promise<void> {
        // Special handling for outbound calls with the trigger
        if (text === "START_OUTBOUND_CALL") {
            console.log("Received special outbound call trigger");
            this.emit("delta", "Hello, this is AI Credit Card Services calling. ");
            this.emit("delta", "Do you have a moment to discuss exclusive credit card offers we have available for you today? ");
            this.emit("final", "");
            this.emit("response", "Hello, this is AI Credit Card Services calling. Do you have a moment to discuss exclusive credit card offers we have available for you today?");
            this.chatContext.push({
                role: "assistant",
                content: "Hello, this is AI Credit Card Services calling. Do you have a moment to discuss exclusive credit card offers we have available for you today?"
            });
            return;
        }

        // Add user message to context
        this.chatContext.push({
            role: "user",
            content: text
        });

        console.log(`Sending request to OpenRouter model: ${this.config.model}`);
        console.log(`User input: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        // Start timing LLM processing
        console.time("@OpenRouter LLM processing time");

        try {
            const requestPayload : any = {
                model: this.config.model,
                messages: this.chatContext,
                temperature: this.config.temperature || 0.7,
                stream: this.config.stream
            };
            
            console.log("OpenRouter request payload structure:", 
                Object.keys(requestPayload).map(k => `${k}: [${typeof requestPayload[k]}]`).join(", "));
            
            const stream : any = await this.openaiClient.chat.completions.create(requestPayload);

            if (this.config.stream) {
                let accumulatedResponse = "";
                
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        accumulatedResponse += content;
                        this.emit(LLM.EVENTS.DELTA, content);
                    }
                }
                
                this.emit(LLM.EVENTS.FINAL, "");
                this.chatContext.push({
                    role: "assistant",
                    content: accumulatedResponse
                });
                
                this.emit(LLM.EVENTS.RESPONSE, accumulatedResponse);
                console.log(`OpenRouter response (${accumulatedResponse.length} chars): "${accumulatedResponse.substring(0, 50)}${accumulatedResponse.length > 50 ? '...' : ''}"`);
            } else {
                // Non-streaming response
                const response = await stream.choices[0]?.message?.content || "";
                this.emit(LLM.EVENTS.DELTA, response);
                this.emit(LLM.EVENTS.FINAL, "");
                this.emit(LLM.EVENTS.RESPONSE, response);
                
                this.chatContext.push({
                    role: "assistant",
                    content: response
                });
                
                console.log(`OpenRouter response (${response.length} chars): "${response.substring(0, 50)}${response.length > 50 ? '...' : ''}"`);
            }
        } catch (error : any) {
            console.error("OpenRouter API Error:", error);
            
            // Log detailed error information
            if (error.response) {
                console.error("OpenRouter API Error Details:", {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers
                });
            }
            
            // Send a fallback response so the conversation doesn't hang
            const fallbackMsg = "I'm sorry, I'm having trouble processing your request at the moment.";
            this.emit(LLM.EVENTS.DELTA, fallbackMsg);
            this.emit(LLM.EVENTS.FINAL, "");
            this.emit(LLM.EVENTS.RESPONSE, fallbackMsg);
            
            this.chatContext.push({
                role: "assistant",
                content: fallbackMsg
            });
        } finally {
            // End timing regardless of success or failure
            console.timeEnd("@OpenRouter LLM processing time");
        }
    }

    public clear(): void {
        this.chatContext = [{
            role: "system",
            content: this.config.prompt || "You are a helpful assistant."
        }];
    }

    public getConfig() {
        return {
            model: this.config.model,
            temperature: this.config.temperature,
            stream: this.config.stream,
            baseUrl: this.config.base_url
        };
    }
}
