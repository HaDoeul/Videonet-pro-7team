import { getFFmpeg } from '@/utils/ffmpeg.ts';

export async function compressVideo(file: File) {
    const ffmpeg = await getFFmpeg();

    // 1. 입력 파일 FFmpeg FS에 저장
    const inputName = file.name;
    const outputName = `${inputName}.mp4`;

    const uint8 = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile(inputName, uint8);

    // 2. FFmpeg 실행 (비트레이트 낮추기)
    await ffmpeg.exec([
        '-i', inputName,
        '-vcodec', 'libx264',
        '-crf', '60',             // 🔥 품질(높을수록 용량↓)
        '-preset', 'ultrafast',    // 인코딩 속도
        '-tune', 'zerolatency',
        '-acodec', 'aac',
        '-b:a', '128k',
        '-threads', '4', 
        '-psnr',
        outputName,
    ]);
    
    // 3. 출력 파일 읽기
    const data = await ffmpeg.readFile(outputName);

    if (typeof data === 'string') {
        throw new Error('FFmpeg compression failed: ' + data);
    }

    // 4. Blob/File로 변환
    const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });

    const compressedFile = new File([blob], outputName, {
        type: 'video/mp4',
    });

    return compressedFile;
}
