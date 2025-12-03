// src/api/files.ts
import axios from "axios";

export async function uploadAndCompress(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    // 옵션 필요하면 추가 가능
    // formData.append("quality", "50");
    // formData.append("audio_bitrate", "64k");
    // formData.append("video_bitrate", "700k");

    const response = await axios.post(
        "/api/files/compress-and-upload",
        formData,
        {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        }
    );

    return response.data;
}
