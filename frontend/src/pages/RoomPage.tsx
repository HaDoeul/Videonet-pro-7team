/**
 * 화상회의 룸 페이지 - WebRTC 비디오 컨퍼런싱
 * (장치 선택 및 변경, 손들기 기능 추가됨, 비디오 품질 측정 기능 추가됨)
 */
//안승찬 UI 테마, 강퇴버튼, 레이아웃 개선
//이한석 웹캠 실시간 통계 그래프 표시 기능 추가
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MicrophoneIcon,
  VideoCameraIcon,
  PhoneXMarkIcon,
  ChatBubbleLeftIcon,
  UserGroupIcon,
  ComputerDesktopIcon,
  CogIcon,
  ArrowLeftIcon,
  XMarkIcon,
  DocumentArrowUpIcon,
  HandRaisedIcon,
  ChartBarIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import {
  MicrophoneIcon as MicrophoneSolidIcon,
  VideoCameraIcon as VideoCameraSolidIcon,
} from '@heroicons/react/24/solid';
import { useAuth } from '@/contexts/AuthContext';
import { NativeWebRTCConnection } from '@/utils/webrtc-native';
import { roomApi } from '@/utils/api';
import io, { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import FileTransfer from '@/components/FileTransfer';

// ✅ Recharts
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';

interface VideoStream {
  userId: string;
  username: string;
  stream: MediaStream;
  isMuted: boolean;
  isVideoOff: boolean;
  isHandRaised: boolean;
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // 상태 관리
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'file' | 'participants' | 'stats'>('participants');
  const [participants, setParticipants] = useState<VideoStream[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [currentVideoTrack, setCurrentVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [originalVideoTrack, setOriginalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // 장치 선택 상태
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>('');

  // Video Quality 상태
  const [Q, setQ] = useState(500);   // 품질/bitrate 설정값 (kbps)
  const [statsData, setStatsData] = useState<any[]>([]); // 그래프 데이터

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const connectionsRef = useRef<Map<string, NativeWebRTCConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localFrameRef = useRef<ImageData | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 장치 목록 가져오기
  const getMediaDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      setAudioInputDevices(audioInputs);
      setVideoInputDevices(videoInputs);

      if (audioInputs.length > 0 && !selectedAudioInput) setSelectedAudioInput(audioInputs[0].deviceId);
      if (videoInputs.length > 0 && !selectedVideoInput) setSelectedVideoInput(videoInputs[0].deviceId);

    } catch (error) {
      console.error('장치 목록을 가져오는 데 실패했습니다:', error);
      toast.error('장치 목록 접근 권한이 거부되었습니다.');
    }
  };

  // 마운트 시 초기화
  useEffect(() => {
    if (!roomId || !user) return;

    getMediaDevices();
    initializeRoom();

    return () => {
      cleanup();
    };
  }, [roomId, user]);

  // 미디어 권한 요청
  const requestMediaPermissions = async (): Promise<MediaStream | null> => {
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedVideoInput
          ? { deviceId: { exact: selectedVideoInput } }
          : {
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 60 },
              facingMode: 'user'
            },
        audio: selectedAudioInput
          ? { deviceId: { exact: selectedAudioInput } }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100
            }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      toast.success('카메라와 마이크가 연결되었습니다');
      return stream;
    } catch (error: any) {
      console.error('미디어 장치 접근 실패:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('카메라/마이크 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.');
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        toast.error('선택된 장치를 찾을 수 없거나 접근할 수 없습니다. 장치를 확인해주세요.');
      } else {
        toast.error('미디어 장치 접근에 실패했습니다: ' + error.message);
      }
      return null;
    }
  };

  // 룸 초기화
  const initializeRoom = async () => {
    try {
      if (!selectedAudioInput && !selectedVideoInput) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const stream = await requestMediaPermissions();

      if (!stream) {
        toast.error('미디어 없이는 회의에 참가할 수 없습니다');
        setTimeout(() => navigate('/dashboard'), 2000);
        return;
      }

      localStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        setCurrentVideoTrack(videoTrack);
        setOriginalVideoTrack(videoTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (!socketRef.current) {
        connectSocket();
      } else {
        console.log('Socket.IO already connected');
      }

      toast.success('회의에 참가했습니다');
    } catch (error) {
      console.error('회의 초기화 실패:', error);
      toast.error('회의 참가에 실패했습니다');
      setTimeout(() => navigate('/dashboard'), 2000);
    }
  };

  // 장치 변경
  const handleDeviceChange = async (kind: 'audio' | 'video', deviceId: string) => {
    if (kind === 'audio') {
      setSelectedAudioInput(deviceId);
    } else {
      setSelectedVideoInput(deviceId);
    }
    await updateLocalStream(kind, deviceId);
  };

  const updateLocalStream = async (kind: 'audio' | 'video', deviceId: string) => {
    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        [kind]: { deviceId: { exact: deviceId } }
      });

      const newTrack = newStream.getTracks()[0];

      const oldTracks = localStreamRef.current.getTracks().filter(track =>
        kind === 'audio' ? track.kind === 'audio' : track.kind === 'video'
      );

      oldTracks.forEach(track => {
        track.stop();
        localStreamRef.current?.removeTrack(track);
      });

      localStreamRef.current.addTrack(newTrack);

      if (kind === 'video') {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        setCurrentVideoTrack(newTrack);
        setOriginalVideoTrack(newTrack);
        setIsVideoOff(false);
      }

      connectionsRef.current.forEach(async connection => {
        await connection.replaceTrack(newTrack);
        applyQToSenders(Q);
      });

      toast.success(`${kind === 'audio' ? '마이크' : '카메라'}가 성공적으로 변경되었습니다.`);
      if (kind === 'audio') setIsMuted(false);
    } catch (error) {
      console.error('스트림 교체 실패:', error);
      toast.error('장치 변경에 실패했습니다. 장치를 확인해주세요.');
    }
  };

  // Q 값 적용
  const applyQToSenders = async (q: number) => {
    connectionsRef.current.forEach((conn) => {
      const pc = (conn as any).pc as RTCPeerConnection | undefined;

      if (!pc) {
        console.warn('WebRTC PeerConnection 객체가 준비되지 않았습니다. Q 적용 실패.');
        return;
      }

      pc.getSenders().forEach(async (sender) => {
        if (sender.track?.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = q * 1000; // kbps → bps
          try {
            await sender.setParameters(params);
          } catch (e) {
            console.error('Bitrate 설정 실패:', e);
          }
        }
      });
    });
  };

  // Socket.IO 연결
  const connectSocket = () => {
    const socketUrl = window.location.hostname.includes('e2b.dev')
      ? 'https://8000-i37urfutaoyq78dgicu29-6532622b.e2b.dev'
      : import.meta.env.VITE_SOCKET_URL || 'http://localhost:7701';

    console.log('🔌 Socket.IO 연결 시도:', socketUrl);

    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('token'),
      },
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('✅ Socket.IO 연결 성공, Socket ID:', socket.id);
      socketIdRef.current = socket.id;

      socket.emit('join_room', {
        roomId,
        userInfo: {
          id: socket.id,
          username: user?.username,
          email: user?.email
        }
      });
    });

    socket.on('user_joined', ({ userId, userInfo, isHandRaised: remoteIsHandRaised = false }: any) => {
      if (userId && userId !== socketIdRef.current) {
        toast(`${userInfo?.username}님이 참가했습니다`, { icon: '👋' });
        createPeerConnection(userId, userInfo?.username, true, remoteIsHandRaised);
      }
    });

    socket.on('room_users', (participants: any[]) => {
      if (participants && participants.length > 0) {
        participants.forEach(({ userId, userInfo, isHandRaised: remoteIsHandRaised = false }) => {
          if (userId && userId !== socketIdRef.current) {
            createPeerConnection(userId, userInfo?.username, false);
          }
        });
      }
    });

    socket.on('user_left', ({ userId }: any) => {
      if (userId !== socketIdRef.current) {
        setParticipants(prev => {
          const target = prev.find(p => p.userId === userId);
          if (target) {
            toast(`${target.username}님이 나갔습니다`, { icon: '👋' });
          }
          return prev.filter(p => p.userId !== userId);
        });

        removePeerConnection(userId);
      }
    });

    socket.on('hand-toggle', ({ from, isRaised }: any) => {
      setParticipants(prev => {
        let username = 'User';
        const newParticipants = prev.map(p => {
          if (p.userId === from) {
            username = p.username;
            return { ...p, isHandRaised: isRaised };
          }
          return p;
        });
        if (isRaised) {
          toast(`${username}님이 손을 들었습니다.`, { icon: '✋' });
        }
        return newParticipants;
      });
    });

    // ✅ 강퇴된 유저 처리
    socket.on('kicked', () => {
      toast.error('호스트에 의해 회의에서 강퇴되었습니다.');
      leaveRoom();
    });

    socket.on('webrtc_offer', ({ from, offer }: any) => { handleWebRTCOffer(from, offer); });
    socket.on('webrtc_answer', ({ from, answer }: any) => { handleWebRTCAnswer(from, answer); });
    socket.on('webrtc_ice_candidate', ({ from, candidate }: any) => { handleWebRTCIceCandidate(from, candidate); });

    socket.on('chat_message', (msg: any) => {
      const normalized = {
        username:
          msg.username ||
          msg.userInfo?.username ||
          msg.user?.username ||
          msg.userId ||
          msg.from ||
          '알수없음',

        content:
          msg.content ||
          msg.message ||
          msg.msg ||
          msg.text ||
          msg.body ||
          '',

        timestamp: msg.timestamp || new Date().toISOString(),
        userId: msg.userId || msg.from || null,
      };
      setMessages(prev => [...prev, normalized]);
    });

    socket.on('connect_error', (error: any) => {
      console.error('❌ Socket.IO 연결 에러:', error);
      toast.error('WebSocket 연결에 실패했습니다');
    });
  };

  // P2P 연결 생성
  const createPeerConnection = async (userId: string, username: string, isInitiator: boolean, remoteIsHandRaised: boolean = false) => {
    const connection = new NativeWebRTCConnection(userId, isInitiator);

    connection.setOnIceCandidate((candidate) => {
      socketRef.current?.emit('webrtc_ice_candidate', { to: userId, candidate });
    });

    connection.setOnStream((stream) => {
      setParticipants(prev => {
        const filtered = prev.filter(p => p.userId !== userId);
        return [...filtered, { userId, username, stream, isMuted: false, isVideoOff: false, isHandRaised: remoteIsHandRaised }];
      });
    });

    connection.setOnClose(() => {
      removePeerConnection(userId);
    });

    await connection.connect(localStreamRef.current || undefined);
    connectionsRef.current.set(userId, connection);

    if (isInitiator) {
      try {
        const offer = await connection.createOffer();
        socketRef.current?.emit('webrtc_offer', { to: userId, offer });
        console.log(`✉️ Offer 전송: ${socketIdRef.current} -> ${userId}`);

        applyQToSenders(Q);
        startLocalFrameCapture();
        startStatsLoop();
      } catch (e) {
        console.error('❌ Offer 생성 및 전송 실패:', e);
      }
    }
  };

  // WebRTC offer 처리
  const handleWebRTCOffer = async (from: string, offer: RTCSessionDescriptionInit) => {
    let connection = connectionsRef.current.get(from);

    if (!connection) {
      console.log('WebRTC 연결 시작 (initiator: false)');
      connection = new NativeWebRTCConnection(from, false);

      connection.setOnIceCandidate((candidate) => {
        socketRef.current?.emit('webrtc_ice_candidate', { to: from, candidate });
      });

      connection.setOnStream((stream) => {
        setParticipants(prev => {
          const existingParticipant = prev.find(p => p.userId === from);
          if (existingParticipant) {
            return prev.map(p => p.userId === from ? { ...p, stream } : p);
          }
          return [...prev, { userId: from, username: 'User', stream, isMuted: false, isVideoOff: false, isHandRaised: false }];
        });
      });

      connection.setOnClose(() => removePeerConnection(from));

      await connection.connect(localStreamRef.current || undefined);
      connectionsRef.current.set(from, connection);
    }

    const pc = (connection as any).pc || (connection as any).peerConnection;
    if (!pc) {
      console.error('RTCPeerConnection 객체(pc)가 NativeWebRTCConnection 내부에 정의되지 않았습니다.');
      return;
    }

    if (pc.signalingState !== 'stable') {
      console.warn(`중복 Offer 또는 잘못된 시점의 Offer 감지 → 무시 (현재 상태: ${pc.signalingState})`);
      return;
    }

    try {
      await pc.setRemoteDescription(offer);
      console.log('원격 Offer 설정 완료');

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('webrtc_answer', { to: from, answer });
      console.log(`✉️ Answer 전송: ${socketIdRef.current} -> ${from}`);

      applyQToSenders(Q);
      startLocalFrameCapture();
      startStatsLoop();
    } catch (err) {
      console.error('Offer 처리 중 오류 발생:', err);
    }
  };

  const handleWebRTCAnswer = async (from: string, answer: RTCSessionDescriptionInit) => {
    const connection = connectionsRef.current.get(from);
    if (!connection) return;

    const pc = (connection as any).pc;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(answer);
      console.log('📡 Remote Answer 적용 완료');

      applyQToSenders(Q);
      startLocalFrameCapture();
      startStatsLoop();
    } catch (err) {
      console.error('❌ Answer 적용 실패:', err);
    }
  };

  const handleWebRTCIceCandidate = async (from: string, candidate: RTCIceCandidateInit) => {
    const connection = connectionsRef.current.get(from);
    if (connection) {
      await connection.addIceCandidate(candidate);
    }
  };

  const removePeerConnection = (userId: string) => {
    const connection = connectionsRef.current.get(userId);
    if (connection) {
      connection.disconnect();
      connectionsRef.current.delete(userId);
    }
    setParticipants(prev => prev.filter(p => p.userId !== userId));
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const nextMutedState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !nextMutedState; });
      setIsMuted(nextMutedState);
      socketRef.current?.emit('media-toggle', { roomId, type: 'audio', enabled: !nextMutedState });
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const nextVideoOffState = !isVideoOff;
      localStreamRef.current.getVideoTracks().forEach(track => { track.enabled = !nextVideoOffState; });
      setIsVideoOff(nextVideoOffState);
      socketRef.current?.emit('media-toggle', { roomId, type: 'video', enabled: !nextVideoOffState });
    }
  };

  const toggleHandRaise = () => {
    const nextHandRaisedState = !isHandRaised;
    setIsHandRaised(nextHandRaisedState);
    socketRef.current?.emit('hand-toggle', { roomId, isRaised: nextHandRaisedState });
    toast(nextHandRaisedState ? '✋ 손을 들었습니다' : '손을 내렸습니다', { icon: nextHandRaisedState ? '✋' : 'ℹ️' });
  };

  // ✅ 강퇴 기능
  const handleKickUser = (targetUserId: string) => {
    if (!socketRef.current) return;
    if (!window.confirm('해당 참가자를 강퇴하시겠습니까?')) return;

    socketRef.current.emit('kick_user', {
      roomId,
      targetUserId,
    });

    setParticipants((prev) => prev.filter((p) => p.userId !== targetUserId));
  };

  // 로컬 프레임 캡처
  const startLocalFrameCapture = () => {
    const video = localVideoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const capture = () => {
      if (!video || !ctx) return;
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        localFrameRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (error) {
        console.error('로컬 프레임 캡처 실패:', error);
      }
      requestAnimationFrame(capture);
    };

    capture();
  };

  const computePSNR = (a: ImageData, b: ImageData): number | null => {
    if (!a || !b || a.data.length !== b.data.length) return null;
    const A = a.data;
    const B = b.data;
    let mse = 0;
    const n = A.length;

    for (let i = 0; i < n; i += 4) {
      const dr = A[i] - B[i];
      const dg = A[i + 1] - B[i + 1];
      const db = A[i + 2] - B[i + 2];
      mse += dr * dr + dg * dg + db * db;
    }

    mse /= (n / 4) * 3;
    if (mse === 0) return 100;
    return 10 * Math.log10((255 * 255) / mse);
  };

  const computeSSIM = (a: ImageData, b: ImageData): number | null => {
    if (!a || !b || a.data.length !== b.data.length) return null;

    const A = a.data;
    const B = b.data;
    const n = A.length / 4;

    const gray = (d: Uint8ClampedArray, i: number) =>
      0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

    let meanA = 0, meanB = 0;

    for (let i = 0; i < A.length; i += 4) {
      meanA += gray(A, i);
      meanB += gray(B, i);
    }
    meanA /= n;
    meanB /= n;

    let varA = 0, varB = 0, cov = 0;

    for (let i = 0; i < A.length; i += 4) {
      const da = gray(A, i) - meanA;
      const db = gray(B, i) - meanB;
      varA += da * da;
      varB += db * db;
      cov += da * db;
    }

    varA /= n;
    varB /= n;
    cov /= n;

    const K1 = 0.01, K2 = 0.03, L = 255;
    const C1 = (K1 * L) ** 2;
    const C2 = (K2 * L) ** 2;

    return (
      ((2 * meanA * meanB + C1) * (2 * cov + C2)) /
      ((meanA ** 2 + meanB ** 2 + C1) * (varA + varB + C2))
    );
  };

  const captureRemoteFrame = (video: HTMLVideoElement | null): ImageData | null => {
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = localFrameRef.current?.width || video.videoWidth;
    canvas.height = localFrameRef.current?.height || video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  const startStatsLoop = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = setInterval(async () => {
      connectionsRef.current.forEach(async (conn) => {
        const pc = (conn as any).pc as RTCPeerConnection | undefined;

        if (!pc) {
          console.warn('PeerConnection 객체가 아직 준비되지 않아 통계 수집을 건너뜁니다.');
          return;
        }

        try {
          const stats = await pc.getStats();
          let bytes = 0;

          stats.forEach((report) => {
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              bytes = report.bytesSent || 0;
            }
          });

          const fileSizeKB = bytes / 1024;

          const remoteVideo = document.getElementById(`remote-video-${conn.getUserId()}`) as HTMLVideoElement | null;

          const remoteFrame = captureRemoteFrame(remoteVideo);
          const localFrame = localFrameRef.current;

          let psnr = null, ssim = null;

          if (remoteFrame && localFrame) {
            psnr = computePSNR(localFrame, remoteFrame);
            ssim = computeSSIM(localFrame, remoteFrame);
          }

          setStatsData((prev) => {
            const newData = [
              ...prev.slice(prev.length > 60 ? 1 : 0),
              {
                q: Q,
                fileSizeKB: parseFloat(fileSizeKB.toFixed(2)),
                psnr: psnr ? parseFloat(psnr.toFixed(2)) : null,
                ssim: ssim ? parseFloat(ssim.toFixed(4)) : null,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              },
            ];
            return newData;
          });
        } catch (error) {
          console.error('통계 수집 중 오류 발생:', error);
        }
      });
    }, 1000);
  };

  const toggleScreenShare = async () => {
    // ... 기존 구현 (생략: 네 코드 그대로 두면 됨)
  };

  const restoreOriginalVideo = () => {
    // ... 기존 구현 (생략)
  };

  const leaveRoom = async () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('leave_room', { roomId });
      socketRef.current.disconnect();
    }
    connectionsRef.current.forEach(conn => conn.disconnect());
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    navigate('/dashboard');
    toast.success('회의에서 나갔습니다');
  };

  const cleanup = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    connectionsRef.current.forEach(conn => conn.disconnect());
    localStreamRef.current?.getTracks().forEach(track => track.stop());
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim() && socketRef.current && user) {
      const message = {
        roomId,
        username: user.username,
        content: messageInput.trim(),
        timestamp: Date.now(),
      };
      socketRef.current.emit('chat_message', message);
      setMessages(prev => [...prev, message]);
      setMessageInput('');
      console.log('메시지 전송:', message);
    }
  };

  const getGridClass = () => {
    const count = participants.length + 1; // +1 for local video
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2 grid-rows-2';
    if (count <= 6) return 'grid-cols-3 grid-rows-2';
    if (count <= 9) return 'grid-cols-3 grid-rows-3';
    return 'grid-cols-4';
  };

  const getVideoTileClass = (isRaised: boolean) => {
    return 'video-tile';
  };

  // ===================== JSX =====================

  return (
   <div className={`h-screen flex ${
  isDarkMode ? 'bg-discord-dark text-white' : 'bg-white text-gray-900'
}`}>
      {/* 왼쪽 아이콘 사이드바 */}
      <div
        className={`w-16 border-r flex flex-col items-center py-4 space-y-4 ${
          isDarkMode ? 'bg-discord-darker border-gray-800' : 'bg-gray-200 border-gray-300'
        }`}
      >
        <button
          onClick={() => { setSidebarTab('participants'); if (!showSidebar) setShowSidebar(true); }}
          className={`p-3 rounded-xl flex items-center justify-center ${
            sidebarTab === 'participants'
              ? 'bg-discord-brand text-white'
              : 'text-gray-400 hover:text-white hover:bg-discord-hover'
          }`}
          title="참가자"
        >
          <UserGroupIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => { setSidebarTab('chat'); if (!showSidebar) setShowSidebar(true); }}
          className={`p-3 rounded-xl flex items-center justify-center ${
            sidebarTab === 'chat'
              ? 'bg-discord-brand text-white'
              : 'text-gray-400 hover:text-white hover:bg-discord-hover'
          }`}
          title="채팅"
        >
          <ChatBubbleLeftIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => { setSidebarTab('file'); if (!showSidebar) setShowSidebar(true); }}
          className={`p-3 rounded-xl flex items-center justify-center ${
            sidebarTab === 'file'
              ? 'bg-discord-brand text-white'
              : 'text-gray-400 hover:text-white hover:bg-discord-hover'
          }`}
          title="파일 전송"
        >
          <DocumentArrowUpIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => { setSidebarTab('stats'); if (!showSidebar) setShowSidebar(true); }}
          className={`p-3 rounded-xl flex items-center justify-center ${
            sidebarTab === 'stats'
              ? 'bg-discord-brand text-white'
              : 'text-gray-400 hover:text-white hover:bg-discord-hover'
          }`}
          title="통계"
        >
          <ChartBarIcon className="w-5 h-5" />
        </button>
      </div>

      {/* 오른쪽 메인 + 사이드바 */}
      <div className="flex-1 flex">
        {/* 메인 비디오 영역 */}
        <div className="flex-1 flex flex-col">
          {/* 설정 모달 */}
          {showSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-discord-light rounded-lg p-6 w-full max-w-md mx-4"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white">설정</h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* 비디오 설정 */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">비디오</h3>
                    <div className="bg-discord-darker rounded p-3 space-y-2">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-400">카메라 장치</span>
                        <select
                          value={selectedVideoInput}
                          onChange={(e) => handleDeviceChange('video', e.target.value)}
                          className="bg-gray-700 text-white rounded p-1 text-sm max-w-[50%]"
                        >
                          {videoInputDevices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label || `카메라 ${device.deviceId.substring(0, 4)}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-400">비디오 켜기/끄기</span>
                        <button
                          onClick={toggleVideo}
                          className={`px-3 py-1 rounded ${!isVideoOff ? 'bg-green-600' : 'bg-red-600'} text-white text-sm`}
                        >
                          {!isVideoOff ? '켜짐' : '꺼짐'}
                        </button>
                      </label>

                      {/* 비디오 품질(Q) */}
                      <label className="flex items-center justify-between pt-2 border-t border-gray-700">
                        <span className="text-gray-400">비디오 품질 (Bitrate - {Q} kbps)</span>
                        <input
                          type="range"
                          min="100"
                          max="2000"
                          step="100"
                          value={Q}
                          onChange={(e) => {
                            const newQ = parseInt(e.target.value);
                            setQ(newQ);
                            applyQToSenders(newQ);
                          }}
                          className="w-1/2"
                        />
                      </label>
                    </div>
                  </div>

                  {/* 오디오 설정 */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">오디오</h3>
                    <div className="bg-discord-darker rounded p-3 space-y-2">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-400">마이크 장치</span>
                        <select
                          value={selectedAudioInput}
                          onChange={(e) => handleDeviceChange('audio', e.target.value)}
                          className="bg-gray-700 text-white rounded p-1 text-sm max-w-[50%]"
                        >
                          {audioInputDevices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label || `마이크 ${device.deviceId.substring(0, 4)}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-400">마이크 켜기/끄기</span>
                        <button
                          onClick={toggleMute}
                          className={`px-3 py-1 rounded ${!isMuted ? 'bg-green-600' : 'bg-red-600'} text-white text-sm`}
                        >
                          {!isMuted ? '켜짐' : '꺼짐'}
                        </button>
                      </label>
                    </div>
                  </div>

                  {/* 사용자 정보 */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">사용자 정보</h3>
                    <div className="bg-discord-darker rounded p-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">이름</span>
                        <span className="text-white">{user?.username}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">이메일</span>
                        <span className="text-white">{user?.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">개인 코드</span>
                        <span className="text-white font-mono">{user?.personalCode}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowSettings(false)}
                    className="btn-discord"
                  >
                    닫기
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* 헤더 */}
          <div
            className={`border-b px-4 py-3 flex items-center justify-between ${
              isDarkMode ? 'bg-discord-darker border-gray-800' : 'bg-gray-100 border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <button
                onClick={() => { if (window.confirm('회의를 나가시겠습니까?')) { leaveRoom(); } }}
                className={`mr-4 p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'bg-discord-light hover:bg-discord-hover text-gray-400 hover:text-white'
                    : 'bg-white hover:bg-gray-100 text-gray-700 hover:text-black border border-gray-300'
                }`}
                title="대시보드로 돌아가기"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>

              <h2 className="font-semibold mr-4">회의룸 #{roomId}</h2>
              <div className="flex items-center text-sm text-gray-400">
                <UserGroupIcon className="w-4 h-4 mr-1" />
                <span>나 + {participants.length}명 = 총 {participants.length + 1}명 참가 중</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsDarkMode(prev => !prev)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'bg-discord-light hover:bg-discord-hover text-gray-400 hover:text-white'
                    : 'bg-white hover:bg-gray-100 text-gray-700 hover:text-black border border-gray-300'
                }`}
                title={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {isDarkMode ? (
                  <MoonIcon className="w-5 h-5" />
                ) : (
                  <SunIcon className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className="text-gray-400 hover:text-white transition-colors"
                title="설정"
              >
                <CogIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 비디오 그리드 */}
          <div className="flex-1 p-4 overflow-auto">
            <div className={`video-grid ${getGridClass()}`}>
              {/* 로컬 비디오 */}
              <div className={getVideoTileClass(isHandRaised)}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${
                    isDarkMode ? 'bg-discord-darker' : 'bg-gray-200'
                  }`}
                  poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480'%3E%3Crect width='640' height='480' fill='%232f3136'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23747f8d' font-family='Arial' font-size='20'%3E카메라 연결 중...%3C/text%3E%3C/svg%3E"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-1 ${localStreamRef.current ? 'bg-green-500' : 'bg-gray-500'}`} />
                  나 ({user?.username}) [ID: {socketIdRef.current?.substring(0, 6)}]
                  {isHandRaised && <HandRaisedIcon className="w-4 h-4 text-yellow-500 ml-1" title="손 들었음" />}
                </div>
                {isVideoOff && (
                  <div
                    className={`absolute inset-0 flex items-center justify-center ${
                      isDarkMode ? 'bg-discord-darker' : 'bg-gray-200'
                    }`}
                  >
                    <div className="text-center">
                      <VideoCameraIcon className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">비디오 꺼짐</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 원격 비디오 */}
              {participants.map((participant) => (
                <div key={participant.userId} className={getVideoTileClass(participant.isHandRaised)}>
                  <video
                    autoPlay
                    playsInline
                    id={`remote-video-${participant.userId}`}
                    ref={(el) => {
                      if (!el) return;
                      if (participant.stream && el.srcObject !== participant.stream) {
                        el.srcObject = participant.stream;
                        el.onloadedmetadata = () => {
                          el.play().catch(() => {});
                        };
                      }
                    }}
                    className={`w-full h-full object-cover ${
                      isDarkMode ? 'bg-discord-darker' : 'bg-gray-200'
                    }`}
                    poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480'%3E%3Crect width='640' height='480' fill='%232f3136'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23747f8d' font-family='Arial' font-size='20'%3E연결 중...%3C/text%3E%3C/svg%3E"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-1 ${participant.stream ? 'bg-green-500' : 'bg-gray-500'}`} />
                    {participant.username} [ID: {participant.userId?.substring(0, 6)}]
                    {participant.isHandRaised && <HandRaisedIcon className="w-4 h-4 text-yellow-500 ml-1" title="손 들었음" />}
                  </div>
                  {participant.isVideoOff && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${
                        isDarkMode ? 'bg-discord-darker' : 'bg-gray-200'
                      }`}
                    >
                      <div className="text-center">
                        <VideoCameraIcon className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">비디오 꺼짐</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {participants.length === 0 && (
                <div
                  className={`video-tile col-span-full flex items-center justify-center ${
                    isDarkMode ? 'bg-discord-darker/50' : 'bg-gray-100'
                  }`}
                >
                  <div className="text-center">
                    <UserGroupIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg mb-2">대기 중...</p>
                    <p className="text-gray-500 text-sm">다른 참가자를 기다리고 있습니다</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 컨트롤 바 */}
          <div
            className={`border-t px-4 py-4 ${
              isDarkMode ? 'bg-discord-darker border-gray-800' : 'bg-gray-100 border-gray-300'
            }`}
          >
            <div className="flex items-center justify-center space-x-4">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleMute}
                className={`p-3 rounded-full ${
                  isMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
                } text-white transition-colors`}
              >
                {isMuted ? (<MicrophoneSolidIcon className="w-6 h-6" />) : (<MicrophoneIcon className="w-6 h-6" />)}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleVideo}
                className={`p-3 rounded-full ${
                  isVideoOff ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
                } text-white transition-colors`}
              >
                {isVideoOff ? (<VideoCameraSolidIcon className="w-6 h-6" />) : (<VideoCameraIcon className="w-6 h-6" />)}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleScreenShare}
                className={`p-3 rounded-full ${
                  isScreenSharing ? 'bg-discord-brand' : 'bg-gray-700 hover:bg-gray-600'
                } text-white transition-colors`}
              >
                <ComputerDesktopIcon className="w-6 h-6" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleHandRaise}
                className={`p-3 rounded-full ${
                  isHandRaised ? 'bg-yellow-500' : 'bg-gray-700 hover:bg-gray-600'
                } text-white transition-colors`}
                title={isHandRaised ? '손 내리기' : '손 들기'}
              >
                <HandRaisedIcon className="w-6 h-6" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                <ChatBubbleLeftIcon className="w-6 h-6" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={leaveRoom}
                className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                <PhoneXMarkIcon className="w-6 h-6" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* 사이드바 */}
        {showSidebar && (
          <motion.aside
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            exit={{ x: 300 }}
            className={`w-96 border-l flex flex-col ${
              isDarkMode ? 'bg-discord-light border-gray-800' : 'bg-white border-gray-300'
            }`}
          >
            {/* 사이드바 헤더 */}
            <div
              className={`px-4 py-3 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-300'
              }`}
            >
              <h3
                className={`text-sm font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}
              >
                {sidebarTab === 'participants' && `참가자 (${participants.length + 1})`}
                {sidebarTab === 'chat' && '채팅'}
                {sidebarTab === 'file' && '파일 전송'}
                {sidebarTab === 'stats' && '통계'}
              </h3>
            </div>

            {/* 참가자 탭 */}
            {sidebarTab === 'participants' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* 로컬 사용자 */}
                <div
                  className={`flex items-center justify-between p-3 rounded-lg shadow ${
                    isDarkMode ? 'bg-discord-darker' : 'bg-gray-100'
                  } ${isHandRaised ? 'ring-2 ring-yellow-500' : ''}`}
                >
                  <div className="flex items-center">
                    <span className="w-8 h-8 flex items-center justify-center bg-discord-brand rounded-full text-white font-bold mr-3">
                      나
                    </span>
                    <div className="text-sm">
                      <p className="text-white font-semibold">
                        {user?.username} (나)
                        {isHandRaised && <HandRaisedIcon className="w-4 h-4 text-yellow-500 ml-2 inline-block" title="손 들었음" />}
                      </p>
                      <p className="text-gray-400 text-xs">ID: {socketIdRef.current?.substring(0, 6)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isMuted ? (<MicrophoneSolidIcon className="w-5 h-5 text-red-500" title="음소거됨" />) : (<MicrophoneIcon className="w-5 h-5 text-green-500" title="마이크 켜짐" />)}
                    {isVideoOff ? (<VideoCameraSolidIcon className="w-5 h-5 text-red-500" title="비디오 꺼짐" />) : (<VideoCameraIcon className="w-5 h-5 text-green-500" title="비디오 켜짐" />)}
                  </div>
                </div>

                {/* 원격 참가자 */}
                {participants.map(p => (
                  <div
                    key={p.userId}
                    className={`flex items-center justify-between p-3 rounded-lg shadow ${
                      isDarkMode ? 'bg-discord-darker' : 'bg-gray-100'
                    } ${p.isHandRaised ? 'ring-2 ring-yellow-500' : ''}`}
                  >
                    <div className="flex items-center">
                      <span className="w-8 h-8 flex items-center justify-center bg-gray-500 rounded-full text-white font-bold mr-3">
                        {p.username.charAt(0).toUpperCase()}
                      </span>
                      <div className="text-sm">
                        <p className="text-white font-semibold">
                          {p.username}
                          {p.isHandRaised && <HandRaisedIcon className="w-4 h-4 text-yellow-500 ml-2 inline-block" title="손 들었음" />}
                        </p>
                        <p className="text-gray-400 text-xs">ID: {p.userId?.substring(0, 6)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {p.isMuted ? (
                        <MicrophoneSolidIcon className="w-5 h-5 text-red-500" title="음소거됨" />
                      ) : (
                        <MicrophoneIcon className="w-5 h-5 text-green-500" title="마이크 켜짐" />
                      )}
                      {p.isVideoOff ? (
                        <VideoCameraSolidIcon className="w-5 h-5 text-red-500" title="비디오 꺼짐" />
                      ) : (
                        <VideoCameraIcon className="w-5 h-5 text-green-500" title="비디오 켜짐" />
                      )}
                      <button
                        onClick={() => handleKickUser(p.userId)}
                        className="ml-2 px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs"
                        title="강퇴하기"
                      >
                        강퇴
                      </button>
                    </div>
                  </div>
                ))}

                {participants.length === 0 && (
                  <div className="text-center p-4 text-gray-500 text-sm">
                    다른 참가자를 기다리고 있습니다...
                  </div>
                )}
              </div>
            )}

            {/* 채팅 탭 */}
            {sidebarTab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {messages.map((msg, idx) => (
                    <div key={idx} className="chat-message">
                      <div className="flex-1">
                        <div className="flex items-baseline mb-1">
                          <span className="text-white font-medium text-sm mr-2">
                            {msg.username}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={sendMessage} className="p-4 border-t border-gray-700">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className="input-field"
                    placeholder="메시지 입력..."
                  />
                </form>
              </>
            )}

            {/* 파일 전송 탭 */}
            {sidebarTab === 'file' && (
              <div className="flex-1 overflow-y-auto p-4">
                <FileTransfer
                  roomId={roomId || ''}
                  socket={socketRef.current}
                  myUserId={socketIdRef.current || ''}
                />
              </div>
            )}

            {/* Stats 탭 */}
            {sidebarTab === 'stats' && (
              <div className="flex-1 overflow-y-auto p-4 text-white space-y-4">
                <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">WebRTC 품질 통계</h3>

                {participants.length === 0 ? (
                  <p className="text-gray-400 text-center">다른 참가자가 연결되면 통계를 볼 수 있습니다.</p>
                ) : (
                  <>
                    <div className="text-sm text-gray-400">
                      <p>현재 설정 Q (Bitrate): <span className="font-mono text-white">{Q} kbps</span></p>
                      <p>측정 대상: 나(송신) → 원격 피어(수신) [첫 번째 연결된 피어 기준]</p>
                      <p>참고: PSNR/SSIM은 로컬 프레임 캡처 후 원격 프레임과 비교하여 측정됩니다.</p>
                    </div>

                    {/* Q vs FileSize */}
                    <div
                      className={`p-3 rounded-lg shadow-lg ${
                        isDarkMode ? 'bg-discord-darker' : 'bg-gray-100'
                      }`}
                    >
                      <h4 className="text-md font-medium mb-2">Q vs File Size (전송량)</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={statsData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid stroke="#444" strokeDasharray="3 3" />
                          <XAxis dataKey="q" stroke="#999" interval="preserveEnd" angle={-15} textAnchor="end" height={50} />
                          <YAxis stroke="#999" domain={['auto', 'auto']} label={{ value: 'KB/s', angle: -90, position: 'insideLeft', fill: '#999' }} />
                          <Tooltip contentStyle={{ backgroundColor: '#2f3136', border: 'none' }} />
                          <Legend wrapperStyle={{ paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="fileSizeKB" name="전송량 (KB/s)" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Q vs PSNR */}
                    <div
                      className={`p-3 rounded-lg shadow-lg ${
                        isDarkMode ? 'bg-discord-darker' : 'bg-gray-100'
                      }`}
                    >
                      <h4 className="text-md font-medium mb-2">Q vs PSNR</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={statsData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid stroke="#444" strokeDasharray="3 3" />
                          <XAxis dataKey="q" stroke="#999" interval="preserveEnd" angle={-15} textAnchor="end" height={50} />
                          <YAxis stroke="#999" domain={[0, 50]} label={{ value: 'PSNR', angle: -90, position: 'insideLeft', fill: '#999' }} />
                          <Tooltip contentStyle={{ backgroundColor: '#2f3136', border: 'none' }} />
                          <Legend wrapperStyle={{ paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="psnr" name="PSNR" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Q vs SSIM */}
                    <div
                      className={`p-3 rounded-lg shadow-lg ${
                        isDarkMode ? 'bg-discord-darker' : 'bg-gray-100'
                      }`}
                    >
                      <h4 className="text-md font-medium mb-2">Q vs SSIM</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={statsData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid stroke="#444" strokeDasharray="3 3" />
                          <XAxis dataKey="q" stroke="#999" interval="preserveEnd" angle={-15} textAnchor="end" height={50} />
                          <YAxis stroke="#999" domain={[0, 1]} label={{ value: 'SSIM', angle: -90, position: 'insideLeft', fill: '#999' }} />
                          <Tooltip contentStyle={{ backgroundColor: '#2f3136', border: 'none' }} />
                          <Legend wrapperStyle={{ paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="ssim" name="SSIM" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.aside>
        )}
      </div>
    </div>
  );
}