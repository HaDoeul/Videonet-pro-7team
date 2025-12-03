// utils/ffmpeg.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpeg: FFmpeg | null = null;

const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
let currentLog = '';

export const getFFmpeg = async () => {
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({message}) => {{
            currentLog = '\n' + message;
        }});
        console.log("load start ffmpeg");
        await ffmpeg.load({
            workerURL: "https://unpkg.com/@ffmpeg/ core-mt@0.12.2 /dist/esm/ffmpeg-core.worker.js",
        });
        console.log("load complete ffmpeg");
    }
    return ffmpeg;
};

export const getFFmpegLog = () => {
    return currentLog;
};