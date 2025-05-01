import twilio from 'twilio';
import "dotenv/config";

const TWILIO_SID = process.env.TWILIO_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_NUMBER = process.env.TWILIO_NUMBER!;

class TWILIOService {
    private client: twilio.Twilio;

    constructor() {
        this.client = twilio(TWILIO_SID, TWILIO_AUTH_TOKEN);
    }

    async createCall(to: string, streamURL: string):Promise<string | null> {
        try {
            const call = await this.client.calls.create({
                twiml: `
                    <Response>
                        <Connect>
                            <Stream url="${streamURL}" />
                        </Connect>
                    </Response>
                `,
                to,
                from: TWILIO_NUMBER,
            });
            return call.sid;
        } catch (error) {
            throw new Error((error as Error).message);
        }
    }
}

export default TWILIOService;
