import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export class CallLogger {
    private logFilePath: string;
    private callCounter: number = 0;
    
    constructor() {
        // Get the current file's directory in ES module context
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        
        // Use the existing logs directory in the backend folder
        const logsDir = path.resolve(__dirname, '../../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Create a log file for call summaries
        this.logFilePath = path.join(logsDir, 'call-summaries.log');
        
        // Create the file if it doesn't exist
        if (!fs.existsSync(this.logFilePath)) {
            fs.writeFileSync(this.logFilePath, '# Call Summaries Log\n\n');
        } else {
            // Try to read the file to determine the last call number
            try {
                const content = fs.readFileSync(this.logFilePath, 'utf8');
                const matches = content.match(/# Call #(\d+)/g);
                if (matches && matches.length > 0) {
                    const lastCallMatch = matches[matches.length - 1];
                    const lastCallNumber = parseInt(lastCallMatch.replace('# Call #', ''), 10);
                    this.callCounter = lastCallNumber;
                }
            } catch (err) {
                console.error('Error reading log file:', err);
            }
        }
    }
    
    /**
     * Format ISO date to dd/mm/yyyy HH:MM:SS IST
     */
    private formatDateToIST(isoDate: string): string {
        const date = new Date(isoDate);
        // Add 5 hours and 30 minutes for IST
        date.setHours(date.getHours() + 5);
        date.setMinutes(date.getMinutes() + 30);
        
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} IST`;
    }
    
    /**
     * Log a call summary with timestamp and detailed conversation
     */
    public logCallSummary(summary: {
        timestamp: string;
        callType: string;
        duration: string;
        summary: string;
        conversation: { speaker: 'user' | 'ai', text: string }[];
        events?: { type: string, timestamp: string, data?: any }[];
        voiceId?: string;
        timingStats?: any;
        usageStats: {
            stt: { audioSeconds: number };
            tts: { characters: number, requests: number };
            llm: { inputTokens: number, outputTokens: number, totalTokens: number };
            summary: { inputTokens: number, outputTokens: number, totalTokens: number };
            totalChars: number;
        }
    }): void {
        // Increment call counter
        this.callCounter++;
        
        // Format timestamp in IST
        const formattedDate = this.formatDateToIST(summary.timestamp);
        
        // Format conversation transcript with timestamps and interruptions
        let conversationTranscript = '';
        
        if (summary.events && summary.events.length > 0) {
            // Create a combined timeline of events and conversation
            const timeline = [
                ...summary.conversation.map(msg => ({ 
                    type: 'message', 
                    speaker: msg.speaker, 
                    text: msg.text 
                })),
                ...summary.events.map(event => ({ 
                    type: 'event', 
                    eventType: event.type,
                    data: event.data
                }))
            ];
            
            // Sort timeline (if events have timestamps)
            // For this example, we'll just combine them as they are
            
            timeline.forEach((item: any) => {
                if (item.type === 'message') {
                    conversationTranscript += `**${item.speaker.toUpperCase()}:** ${item.text}\n\n`;
                } else if (item.type === 'event') {
                    conversationTranscript += `> **SYSTEM EVENT:** ${item.eventType.toUpperCase()}\n`;
                    if (item.data) {
                        conversationTranscript += `> Data: ${JSON.stringify(item.data)}\n`;
                    }
                    conversationTranscript += `\n`;
                }
            });
        } else {
            // Just format conversation without events
            conversationTranscript = summary.conversation
                .map(msg => `**${msg.speaker.toUpperCase()}:** ${msg.text}`)
                .join('\n\n');
        }
        
        const logEntry = `
# Call #${this.callCounter} (${formattedDate})

## Call Details
- **Type:** ${summary.callType}
- **Duration:** ${summary.duration}
- **UTC Timestamp:** ${summary.timestamp}
${summary.voiceId ? `- **Voice ID:** ${summary.voiceId}` : ''}

## AI Summary
${summary.summary}

## Complete Conversation Transcript
${conversationTranscript}

## Technical Details

### Speech-to-Text (STT)
- **Audio Duration:** ${summary.usageStats.stt.audioSeconds.toFixed(1)} seconds
- **Characters Recognized:** ${summary.usageStats.llm.inputTokens}
- **Model:** nova-3

### Text-to-Speech (TTS)
- **Characters Spoken:** ${summary.usageStats.tts.characters}
- **API Requests:** ${summary.usageStats.tts.requests}
${summary.voiceId ? `- **Voice Used:** ${summary.voiceId}` : ''}

### LLM Processing
- **Input Characters:** ${summary.usageStats.llm.inputTokens}
- **Output Characters:** ${summary.usageStats.llm.outputTokens}
- **Total Characters:** ${summary.usageStats.llm.totalTokens}

### Summary Generation
- **Input Characters:** ${summary.usageStats.summary.inputTokens}
- **Output Characters:** ${summary.usageStats.summary.outputTokens}
- **Total Characters:** ${summary.usageStats.summary.totalTokens}

### Overall Usage
- **Combined Character Usage:** ${summary.usageStats.totalChars}

---

`;
        
        // Append to the log file
        fs.appendFileSync(this.logFilePath, logEntry);
        console.log(`Call #${this.callCounter} summary logged to ${this.logFilePath}`);
    }
}

// Create and export a singleton instance
export const callLogger = new CallLogger();