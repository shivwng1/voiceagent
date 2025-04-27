import { EventEmitter } from "node:events";

/**
 * ChunkedSentenceStream is a class that processes text chunks and emits sentences.
 * It uses a delimiter to separate sentences and handles both final and intermediate chunks.
 * events => sentence
 */
export class ChunkedSentenceStream extends EventEmitter {
    private buffer: string = "";

    constructor(public readonly delimiters: string[] = ["।", "?", "!", "."]) {
        super();
        // Create a regex pattern for the delimiters
    }

    pushDelta(delta: string, isFinal: boolean): void {
        this.buffer += delta;

        let delimiterIndex = -1;
        while (
            (delimiterIndex = this.delimiters
                .map((delimiter) => this.buffer.indexOf(delimiter))
                .filter((index) => index !== -1)
                .sort((a, b) => a - b)[0]) !== undefined
        ) {
            if (delimiterIndex === -1) break;

            const sentence = this.buffer.slice(0, delimiterIndex + 1).trim();
            this.emit("sentence", sentence);

            this.buffer = this.buffer.slice(delimiterIndex + 1);
        }

        if (isFinal && this.buffer.trim().length > 0) {
            this.emit("sentence", this.buffer.trim());
            this.clear();
        }
    }

    clear() {
        this.buffer = "";
    }
    
    static readonly EVENTS = {
        SENTENCE: "sentence"
    } as const;
}
