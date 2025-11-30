/**
 * Native WebRTC 구현 - SimplePeer 없이 순수 WebRTC API 사용
 * 브라우저 호환성 문제 해결 및 T3 통계 기능을 위해 수정됨
 */

import type { ConnectionState } from '@/types';

// WebRTC 설정
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Native WebRTC 연결 관리 클래스
 */
export class NativeWebRTCConnection {
  // 실제 RTCPeerConnection 인스턴스는 여기 저장
  private _pc: RTCPeerConnection | null = null;

  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private connectionState: ConnectionState = 'new';
  
  // 콜백 함수들
  private onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;
  private onStream: ((stream: MediaStream) => void) | null = null;
  private onClose: (() => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  constructor(
    private readonly userId: string,
    private readonly isInitiator: boolean
    
  ) {}
  public getUserId():string{
    return this.userId;
  }
  // ====================================================================
  // 유틸리티 및 통계 메서드
  // ====================================================================

  /**
   * Promise 기반 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 내부 pc 접근용 getter (RoomPage에서 conn.peerConnection, conn.pc 둘 다 지원)
   */
  get peerConnection(): RTCPeerConnection | null {
    return this._pc;
  }

  get pc(): RTCPeerConnection | null {
    return this._pc;
  }

  /**
   * RTCPeerConnection의 통계를 가져옵니다. (T3 기능용)
   * @returns RTCStatsReport (통계 보고서)
   */
  async getStats(): Promise<RTCStatsReport> {
    if (!this._pc) {
      // T3 통계 모니터링 시 연결이 없으면 에러 대신 빈 통계 보고서 반환
      return new Map() as RTCStatsReport;
    }
    return this._pc.getStats();
  }

  // ====================================================================
  // 스트림 및 연결 메서드
  // ====================================================================

  /**
   * 로컬 미디어 스트림 가져오기 (실제 미디어만 사용)
   */
  async getLocalStream(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user', // 전면 카메라 우선
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });

      console.log('로컬 미디어 스트림 획득 성공');
      return this.localStream;
    } catch (error: any) {
      console.error('미디어 스트림 획득 실패:', error);

      let errorMessage = '카메라 또는 마이크에 접근할 수 없습니다.';
      if (error.name === 'NotAllowedError') {
        errorMessage = '카메라/마이크 권한이 거부되었습니다.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = '카메라 또는 마이크를 찾을 수 없습니다.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = '카메라/마이크가 다른 프로그램에서 사용 중입니다.';
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * P2P 연결 시작
   * @param localStream - 외부에서 전달받은 로컬 스트림 (선택적)
   */
  async connect(localStream?: MediaStream): Promise<void> {
    try {
      // RTCPeerConnection 생성
      this._pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
      });

      // 이벤트 핸들러 설정
      this.setupPeerConnectionEvents();

      // 로컬 스트림 추가
      const stream = localStream || await this.getLocalStream();
      this.localStream = stream;

      stream.getTracks().forEach(track => {
        this._pc!.addTrack(track, stream);
      });

      this.connectionState = 'connecting';
      console.log(`WebRTC 연결 시작 (initiator: ${this.isInitiator})`);
    } catch (error) {
      console.error('P2P 연결 시작 실패:', error);
      this.connectionState = 'failed';
      throw error;
    }
  }

  /**
   * Peer Connection 이벤트 설정
   */
  private setupPeerConnectionEvents(): void {
    if (!this._pc) return;

    // ICE candidate 이벤트
    this._pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate 생성');
        this.onIceCandidate?.(event.candidate.toJSON());
      }
    };

    // 원격 스트림 수신
    this._pc.ontrack = (event) => {
      console.log('원격 트랙 수신');
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.onStream?.(this.remoteStream);
      }
      this.remoteStream.addTrack(event.track);
    };

    // 연결 상태 변경
    this._pc.onconnectionstatechange = () => {
      console.log('연결 상태:', this._pc?.connectionState);

      switch (this._pc?.connectionState) {
        case 'connected':
          this.connectionState = 'connected';
          break;
        case 'disconnected':
        case 'closed':
          this.connectionState = 'closed';
          this.cleanup();
          this.onClose?.();
          break;
        case 'failed':
          this.connectionState = 'failed';
          this.onError?.(new Error('WebRTC 연결 실패'));
          break;
      }
    };
  }

  /**
   * Offer 생성 (연결 시작자)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this._pc) throw new Error('PeerConnection이 없습니다');

    const offer = await this._pc.createOffer();
    await this._pc.setLocalDescription(offer);
    console.log('Offer 생성 완료');

    return offer;
  }

  /**
   * Answer 생성 (연결 수신자)
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this._pc) throw new Error('PeerConnection이 없습니다');

    // Offer가 설정된 후에만 Answer 생성 가능
    if (this._pc.remoteDescription?.type !== 'offer') {
      throw new Error('원격 Offer가 설정되지 않았습니다');
    }

    const answer = await this._pc.createAnswer();
    await this._pc.setLocalDescription(answer);
    console.log('Answer 생성 완료');

    return answer;
  }

  /**
   * 원격 SDP 설정 (Offer/Answer 처리)
   * InvalidStateError 방어 및 상태 대기 로직 포함
   */
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this._pc) throw new Error('PeerConnection이 없습니다');

    const pc = this._pc;

    // Answer 수신 시 방어 로직
    if (description.type === 'answer') {
      if (pc.remoteDescription?.type === 'answer') {
        console.warn('Answer가 이미 설정되어 Answer 수신을 무시합니다.');
        return;
      }

      if (pc.signalingState === 'stable' && !this.isInitiator) {
        console.warn(`[Answer 처리 무시] 현재 상태: ${pc.signalingState}. Offer 수신자가 Answer를 처리하는 것은 비정상적이므로 무시합니다.`);
        return;
      }

      let attempts = 0;
      const maxAttempts = 5;
      while (pc.signalingState !== 'have-local-offer' && attempts < maxAttempts) {
        console.log(`[Answer 대기] 현재 상태: ${pc.signalingState}, 100ms 대기 후 재시도... (${attempts + 1}/${maxAttempts})`);
        await this.delay(100);
        attempts++;
      }

      if (pc.signalingState !== 'have-local-offer') {
        if (pc.signalingState !== 'stable') {
          console.warn(`[Answer 처리 실패] 500ms 대기 후에도 상태가 'have-local-offer'가 아님: ${pc.signalingState}. Answer를 무시합니다.`);
          return;
        }
      }
    }

    try {
      await pc.setRemoteDescription(description);
      console.log(`원격 SDP 설정 완료: ${description.type} (상태: ${pc.signalingState})`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'InvalidStateError') {
        console.warn(`[InvalidStateError 감지] setRemoteDescription 중 InvalidStateError 발생: ${error.message}`);
      } else {
        console.error('원격 SDP 설정 실패 (치명적 오류):', error);
        throw error;
      }
    }
  }

  /**
   * ICE Candidate 추가
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this._pc) throw new Error('PeerConnection이 없습니다');

    try {
      await this._pc.addIceCandidate(candidate);
      console.log('ICE candidate 추가 완료');
    } catch (error) {
      console.warn('ICE candidate 추가 실패 (비치명적일 수 있음):', error);
    }
  }

  /**
   * 마이크 켜기/끄기
   */
  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`마이크 ${enabled ? '켜짐' : '꺼짐'}`);
    }
  }

  /**
   * 비디오 켜기/끄기
   */
  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`비디오 ${enabled ? '켜짐' : '꺼짐'}`);
    }
  }

  /**
   * 화면 공유 토글
   * @param enabled - true면 화면 공유 시작, false면 원래 비디오로 복구
   * @param screenTrack - 화면 공유 트랙 (enabled가 true일 때)
   * @param originalTrack - 원래 비디오 트랙 (enabled가 false일 때)
   */
  async toggleScreenShare(
    enabled: boolean,
    screenTrack?: MediaStreamTrack,
    originalTrack?: MediaStreamTrack
  ): Promise<void> {
    if (!this._pc) return;

    try {
      const sender = this._pc.getSenders().find(
        s => s.track?.kind === 'video'
      );

      if (!sender) {
        console.error('비디오 sender를 찾을 수 없습니다');
        return;
      }

      if (enabled && screenTrack) {
        await sender.replaceTrack(screenTrack);
        console.log('P2P 연결에 화면 공유 트랙 설정');
      } else if (!enabled && originalTrack) {
        await sender.replaceTrack(originalTrack);
        console.log('P2P 연결에 원래 비디오 트랙 복구');
      } else if (!enabled && this.localStream) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          await sender.replaceTrack(videoTrack);
          console.log('P2P 연결에 로컬 비디오 트랙 복구');
        }
      }
    } catch (error) {
      console.error('화면 공유 토글 실패:', error);
      throw error;
    }
  }

  /**
   * 로컬 비디오/오디오 트랙 교체 (장치 변경용)
   */
  async replaceTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this._pc) return;

    try {
      const sender = this._pc.getSenders().find(
        s => s.track && s.track.kind === newTrack.kind
      );

      if (!sender) {
        console.warn('교체할 sender를 찾지 못했습니다.');
        return;
      }

      await sender.replaceTrack(newTrack);
      console.log(`트랙 교체 완료 (${newTrack.kind})`);

      // localStream에도 반영
      if (this.localStream) {
        // 같은 kind의 기존 트랙 제거
        this.localStream.getTracks()
          .filter(t => t.kind === newTrack.kind)
          .forEach(t => this.localStream!.removeTrack(t));
        this.localStream.addTrack(newTrack);
      }
    } catch (error) {
      console.error('replaceTrack 실패:', error);
      throw error;
    }
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * 리소스 정리
   */
  private cleanup(): void {
    if (this._pc) {
      this._pc.close();
      this._pc = null;
    }

    // 로컬 스트림은 RoomPage에서 관리 (여기선 stop 안 함)
    this.remoteStream = null;
    this.connectionState = 'closed';

    console.log('WebRTC 리소스 정리 완료');
  }

  // 콜백 설정 메서드들
  setOnIceCandidate(callback: (candidate: RTCIceCandidateInit) => void): void {
    this.onIceCandidate = callback;
  }

  setOnStream(callback: (stream: MediaStream) => void): void {
    this.onStream = callback;
  }

  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  setOnError(callback: (err: Error) => void): void {
    this.onError = callback;
  }

  // Getter 메서드들
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getCurrentLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}
