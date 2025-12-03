"""
VideoNet Pro - 파일 전송 + 자동 압축 시스템 (T4/T5 완성형)
이미지 / 오디오 / 비디오 → 자동 판별 + 자동 압축 + 업로드
"""

import os
import hashlib
import subprocess
from typing import Dict
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import aiofiles
from pathlib import Path
from PIL import Image

router = APIRouter(prefix="/api/files", tags=["File Transfer"])

# 업로드 폴더
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# 업로드된 파일 메타데이터 저장
file_metadata: Dict[str, dict] = {}


# ------------------------------------------
# 공용: 해시 계산 (무결성 검증)
# ------------------------------------------
def calculate_file_hash(file_path: str) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()


# ------------------------------------------
# 이미지 압축
# ------------------------------------------
async def compress_image(file: UploadFile, quality: int = 50):
    original_path = UPLOAD_DIR / file.filename
    compressed_path = UPLOAD_DIR / f"img_q{quality}_{file.filename}"

    # 원본 저장
    async with aiofiles.open(original_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)

    # JPEG 압축
    img = Image.open(original_path).convert("RGB")
    img.save(compressed_path, "JPEG", quality=quality)

    size = os.path.getsize(compressed_path)
    return {
        "type": "image",
        "compressed_file": str(compressed_path),
        "quality": quality,
        "file_size": size
    }


# ------------------------------------------
# 오디오 압축 (ffmpeg 필요)
# ------------------------------------------
async def compress_audio(file: UploadFile, bitrate: str = "64k"):
    input_path = UPLOAD_DIR / file.filename
    output_path = UPLOAD_DIR / f"audio_{bitrate}_{file.filename}"

    async with aiofiles.open(input_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)

    # ffmpeg 오디오 비트레이트 압축
    cmd = f"ffmpeg -y -i {input_path} -b:a {bitrate} {output_path}"
    subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    size = os.path.getsize(output_path)
    return {
        "type": "audio",
        "compressed_file": str(output_path),
        "bitrate": bitrate,
        "file_size": size
    }


# ------------------------------------------
# 비디오 압축 (ffmpeg 필요)
# ------------------------------------------
async def compress_video(file: UploadFile, bitrate: str = "700k"):
    input_path = UPLOAD_DIR / file.filename
    output_path = UPLOAD_DIR / f"video_{bitrate}_{file.filename}"

    async with aiofiles.open(input_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)

    # ffmpeg 비디오 비트레이트 압축
    cmd = f"ffmpeg -y -i {input_path} -b:v {bitrate} -bufsize {bitrate} -crf 40 {output_path}"
    subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    size = os.path.getsize(output_path)
    return {
        "type": "video",
        "compressed_file": str(output_path),
        "bitrate": bitrate,
        "file_size": size
    }


# ------------------------------------------
# 핵심: 자동 분류 + 자동 압축 + 자동 업로드
# (버튼 1개로 T4/T5 끝)
# ------------------------------------------
@router.post("/compress-and-upload")
async def compress_and_upload(
    file: UploadFile = File(...),
    quality: int = 50,
    audio_bitrate: str = "64k",
    video_bitrate: str = "700k"
):
    filename = file.filename.lower()

    # 이미지 파일
    if filename.endswith((".jpg", ".jpeg", ".png")):
        return await compress_image(file, quality)

    # 오디오 파일
    if filename.endswith((".mp3", ".wav", ".aac")):
        return await compress_audio(file, bitrate=audio_bitrate)

    # 비디오 파일
    if filename.endswith((".webm", ".mp4", ".mov", ".avi", ".mkv")):
        return await compress_video(file, bitrate=video_bitrate)

    # 지원 안 되는 확장자
    raise HTTPException(400, "지원하지 않는 파일 형식입니다.")


# ------------------------------------------
# 파일 다운로드
# ------------------------------------------
@router.get("/download/{file_id}")
async def download_file(file_id: str):
    if file_id not in file_metadata:
        raise HTTPException(404, "파일을 찾을 수 없습니다")

    meta = file_metadata[file_id]
    return FileResponse(meta["path"], filename=meta["filename"])


# ------------------------------------------
# 파일 무결성 검증
# ------------------------------------------
@router.get("/verify/{file_id}")
async def verify_file(file_id: str, client_hash: str):
    if file_id not in file_metadata:
        raise HTTPException(404, "파일이 존재하지 않습니다")

    server_hash = file_metadata[file_id]["hash"]
    is_valid = (server_hash == client_hash)

    return {
        "file_id": file_id,
        "server_hash": server_hash,
        "client_hash": client_hash,
        "is_valid": is_valid
    }


# ------------------------------------------
# 파일 삭제
# ------------------------------------------
@router.delete("/delete/{file_id}")
async def delete_file(file_id: str):
    if file_id not in file_metadata:
        raise HTTPException(404, "파일을 찾을 수 없습니다")

    meta = file_metadata[file_id]
    path = meta["path"]

    if os.path.exists(path):
        os.remove(path)

    del file_metadata[file_id]

    return {"message": "파일 삭제 완료"}