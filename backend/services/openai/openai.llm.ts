import { LLM } from "@shared/abstractions/LLM.abstraction";
import TTS from "@shared/abstractions/TTS.abstraction";
import { IChatContext, ILLMConfig, IOpenStreamEventResponse } from "@shared/interfaces/abstraction.interface";
import { OpenAI } from "openai";

export class OpenAiLLM extends LLM {
    protected config: ILLMConfig;
    public chatContext: IChatContext[];
    protected openaiClient: OpenAI;

    constructor(config: ILLMConfig) {
        super();
        this.config = {
            stream: true,
            token: 150,
            model: 'gpt-3.5-turbo',
            temperature: 0.1,
            prompt: config.prompt || "You are helpfull assistant",
            ...config
        }
        this.openaiClient = new OpenAI({ apiKey: this.config.apiKey });
        this.chatContext = [{
            role: "system",
            content: this.config.prompt || "You are helpfull assistant"
        }]
    }


    async send(text: string): Promise<void> {

        this.chatContext.push({
            role: "user",
            content: text
        })

        const stream = await this.openaiClient.responses.create({
            stream: this.config.stream,
            model: this.config.model || "gpt-4o",
            input: this.chatContext
        })

        if (Symbol.asyncIterator in stream) {
            for await (let chunk of stream) {
                const event = chunk as IOpenStreamEventResponse;
                if (event.type == 'response.output_text.delta') {

                    //@ts-ignore
                    this.emit(LLM.EVENTS.DELTA, event.delta)

                } else if (event.type == 'response.output_text.done') {
                    //@ts-ignore
                    this.emit(LLM.EVENTS.FINAL, '')


                    this.chatContext.push({
                        role: "assistant",
                        content: event.text as string
                    });

                    //@ts-ignore
                    this.emit(LLM.EVENTS.RESPONSE, event.text)
                }
            }
        } else {
            //@ts-ignore
            this.emit(LLM.EVENTS.DELTA, stream.output_text)
            //@ts-ignore
            this.emit(LLM.EVENTS.FINAL, '')
            //@ts-ignore
            this.emit(LLM.EVENTS.RESPONSE, stream.output_text)
        }
    }
}
