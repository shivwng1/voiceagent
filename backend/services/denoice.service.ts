import { PassThrough } from "stream";
import ffmpeg from "fluent-ffmpeg";

export const denoiseAudioStream = (buffer: Buffer): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const outputStream = new PassThrough();
        const chunks: Buffer[] = [];

        // Use ffmpeg to process the buffer directly
        ffmpeg()
            .input(outputStream)
            .inputFormat("wav")
            .audioFilters(["arnndn=model=bd.rnnn"])
            .audioCodec("pcm_s16le")
            .format("wav")
            .on("error", (err) => {
                console.error("FFmpeg error:", err.message);
                reject(err);
            })
            .on("end", () => {
                resolve(Buffer.concat(chunks));
            })
            .pipe(outputStream, { end: true });

        // Write the buffer to the stream
        outputStream.end(buffer);

        // Collect processed chunks
        outputStream.on("data", (chunk) => chunks.push(chunk));
    });
};
