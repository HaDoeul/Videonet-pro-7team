"""
VideoNet Pro - 파일 전송 + 자동 압축 시스템 (T4/T5 완성형)
이미지 / 오디오 / 비디오 → 자동 판별 + 자동 압축 + 업로드
"""
#김종헌 파일 전송 + 자동 압축 시스템 구현
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
    compressed_filename = f"img_q{quality}_{file.filename}"
    compressed_path = UPLOAD_DIR / compressed_filename

    # 원본 저장
    async with aiofiles.open(original_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)

    # JPEG 압축
    try:
        img = Image.open(original_path).convert("RGB")
        img.save(compressed_path, "JPEG", quality=quality)
        
        size = os.path.getsize(compressed_path)
        return {
            "type": "image",
            "filename": compressed_filename, # 파일명만 반환
            "quality": quality,
            "file_size": size
        }
    except Exception as e:
        print(f"이미지 압축 실패: {e}")
        return {"error": "압축 실패", "filename": file.filename}


# ------------------------------------------
# 오디오 압축 (ffmpeg 필요)
# ------------------------------------------
async def compress_audio(file: UploadFile, bitrate: str = "64k"):
    input_path = UPLOAD_DIR / file.filename
    compressed_filename = f"audio_{bitrate}_{file.filename}"
    output_path = UPLOAD_DIR / compressed_filename

    async with aiofiles.open(input_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)

    # ffmpeg 오디오 비트레이트 압축
    cmd = f"ffmpeg -y -i {input_path} -b:a {bitrate} {output_path}"
    subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if not output_path.exists():
         raise HTTPException(500, "오디오 압축 실패")

    size = os.path.getsize(output_path)
    return {
        "type": "audio",
        "filename": compressed_filename,
        "bitrate": bitrate,
        "file_size": size
    }


# ------------------------------------------
# 비디오 압축 (ffmpeg 필요)
# ------------------------------------------
async def compress_video(file: UploadFile, bitrate: str = "700k"):
    input_path = UPLOAD_DIR / file.filename
    compressed_filename = f"video_{bitrate}_{file.filename}"
    output_path = UPLOAD_DIR / compressed_filename

    async with aiofiles.open(input_path, 'wb') as f:
        while chunk := await file.read(8192):
            await f.write(chunk)

    # ffmpeg 비디오 비트레이트 압축
    # crf 값을 조절하여 화질/용량 균형 조절
    cmd = f"ffmpeg -y -i {input_path} -b:v {bitrate} -bufsize {bitrate} -crf 35 -preset ultrafast {output_path}"
    subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if not output_path.exists():
         raise HTTPException(500, "비디오 압축 실패")

    size = os.path.getsize(output_path)
    return {
        "type": "video",
        "filename": compressed_filename,
        "bitrate": bitrate,
        "file_size": size
    }


# ------------------------------------------
# 핵심: 자동 분류 + 자동 압축 + 자동 업로드
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
    if filename.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return await compress_image(file, quality)

    # 오디오 파일
    if filename.endswith((".mp3", ".wav", ".aac", ".flac")):
        return await compress_audio(file, bitrate=audio_bitrate)

    # 비디오 파일
    if filename.endswith((".webm", ".mp4", ".mov", ".avi", ".mkv")):
        return await compress_video(file, bitrate=video_bitrate)

    # 지원 안 되는 확장자
    raise HTTPException(400, "지원하지 않는 파일 형식입니다.")


# ------------------------------------------
# 파일 다운로드 (수정됨)
# ------------------------------------------
@router.get("/download-compressed")
async def download_compressed(filename: str):
    """
    압축된 파일을 다운로드합니다.
    파일명만 받아서 uploads 폴더에서 찾습니다.
    """
    # 경로 조작 방지 (보안)
    safe_filename = os.path.basename(filename)
    file_path = UPLOAD_DIR / safe_filename
    
    if not file_path.exists():
        raise HTTPException(404, "파일을 찾을 수 없습니다")
        
    return FileResponse(
        path=file_path, 
        filename=safe_filename,
        media_type='application/octet-stream'
    )


# ------------------------------------------
# 파일 검증 (기존 유지)
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