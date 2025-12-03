// 📌 서버에서 이미지/비디오/오디오 자동 압축 후 Blob으로 변환
export async function serverCompress(file) {
    const form = new FormData();
    form.append("file", file);

    // 1) 서버에 압축 요청
    const res = await fetch("http://192.168.68.102:7701/api/files/compress-and-upload", {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        throw new Error("서버 압축 실패");
    }

    const data = await res.json();

    // 서버가 반환하는 예시:
    // {
    //   type: "image",
    //   compressed_file: "uploads/img_q50_test.jpg",
    //   file_size: 30204
    // }

    const compressedPath = data.compressed_file;

    // 2) 압축된 파일 다운로드 요청
    const downloadRes = await fetch(
        `http://192.168.68.102:7701/api/files/download-compressed?path=${encodeURIComponent(compressedPath)}`
    );

    if (!downloadRes.ok) {
        throw new Error("압축된 파일 다운로드 실패");
    }

    const blob = await downloadRes.blob();

    // 3) Blob → File 변환 (프론트에서 동일하게 사용 가능)
    return new File([blob], file.name, { type: file.type });
}
