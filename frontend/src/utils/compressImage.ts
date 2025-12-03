import imageCompression from "browser-image-compression";

export async function compressImage(file: File): Promise<File> {
    const options = {
        maxSizeMB: 1,                // 최대 크기 (원하는대로 조절)
        maxWidthOrHeight: 1920,      // 너무 큰 이미지 방지
        useWebWorker: true,          // 속도 향상
        initialQuality: 0.1,         // q=10 → 0.1
    };

    // 파일이 이미지인지 체크
    if (!file.type.startsWith("image/")) return file;

    try {
        const compressedFile = await imageCompression(file, options);
        console.log(
        `압축 성공: ${file.size} → ${compressedFile.size} bytes`
        );
        return compressedFile;
    } catch (err) {
        console.error("이미지 압축 실패:", err);
        return file; // 압축 실패하면 원본 사용
    }
}
