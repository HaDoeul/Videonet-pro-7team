// utils/ffmpeg.ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
let ffmpeg: FFmpeg | null = null;


let currentLog: string = '';
// const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
// const coreURL = toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript');
// const wasmURL = toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');
// const workerURL = toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript');

// const coreURL = "/ffmpeg/ffmpeg-core.js";
// const wasmURL = "/ffmpeg/ffmpeg-core.wasm";
// const workerURL = "/ffmpeg/ffmpeg-core.worker.js";

export const getFFmpeg = async () => {
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();

        console.log("load start ffmpeg");
        await ffmpeg.load({

        });
        console.log("load complete ffmpeg");
    }
    return ffmpeg;
};
