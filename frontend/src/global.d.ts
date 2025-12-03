// src/global.d.ts
export {};

declare global {
  interface Window {
    cv: any;                         // OpenCV.js가 여기에 올라감
    onOpenCvReadyCallback?: () => void;  // React에서 설정
  }
}