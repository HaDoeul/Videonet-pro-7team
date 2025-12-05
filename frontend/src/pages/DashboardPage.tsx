/**
 * 대시보드 페이지 - 로그인 후 메인 페이지
 */
//안승찬 UI테마, 레이아웃 개선
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  VideoCameraIcon,
  PlusIcon,
  UserGroupIcon,
  ClockIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  ClipboardDocumentCheckIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { roomApi } from '@/utils/api';
import type { Room } from '@/types';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPersonalCode, setShowPersonalCode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // 방 목록 불러오기
  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const data = await roomApi.getRooms();
      setRooms(data);
    } catch (error) {
      console.error('방 목록 불러오기 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 새 방 만들기
  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast.error('방 이름을 입력해주세요');
      return;
    }

    try {
      setIsLoading(true);
      console.log('방 생성 시작:', newRoomName);
      
      const room = await roomApi.createRoom({
        name: newRoomName,
        maxParticipants: 100,
      });
      
      console.log('방 생성 성공:', room);
      
      toast.success('방이 생성되었습니다!');
      setShowCreateModal(false);
      setNewRoomName('');
      
      // 방 목록 새로고침
      await fetchRooms();
      
      // 생성한 방으로 바로 이동
      navigate(`/room/${room.id}`);
      
    } catch (error: any) {
      console.error('방 생성 실패:', error);
      toast.error(error?.response?.data?.detail || '방 생성에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // 방 참가하기 - 단순화
  const handleJoinRoom = (roomId: string) => {
    console.log('회의 참가 시작:', roomId);
    
    if (!roomId) {
      console.error('roomId가 없습니다');
      toast.error('방 ID가 없습니다');
      return;
    }
    
    // API 호출 없이 바로 이동
    toast.success('회의에 참가합니다');
    navigate(`/room/${roomId}`);
  };

  // 개인 코드 복사
  const copyPersonalCode = () => {
    if (user?.personalCode) {
      navigator.clipboard.writeText(user.personalCode);
      toast.success('개인 참가 코드가 복사되었습니다!');
    }
  };

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'bg-discord-dark text-white' : 'bg-white text-gray-900'}`}>
      {/* 아이콘 사이드바 */}
<aside
  className={`w-20 border-r flex flex-col items-center py-4 space-y-4 ${
    isDarkMode ? 'bg-discord-darker border-gray-800' : 'bg-gray-200 border-gray-300'
  }`}
>
  <button
    onClick={() => setShowPersonalCode(true)}
    className={`p-3 rounded-xl ${
      isDarkMode
        ? 'text-gray-300 hover:text-white hover:bg-discord-hover'
        : 'text-gray-700 hover:text-black hover:bg-gray-300'
    }`}
    title="내 참가 코드"
  >
    <ClipboardDocumentCheckIcon className="w-6 h-6" />
  </button>

  <button
    onClick={() => setShowSettings(true)}
    className={`p-3 rounded-xl ${
      isDarkMode
        ? 'text-gray-300 hover:text-white hover:bg-discord-hover'
        : 'text-gray-700 hover:text-black hover:bg-gray-300'
    }`}
    title="설정"
  >
    <Cog6ToothIcon className="w-6 h-6" />
  </button>

  <button
    onClick={logout}
    className={`p-3 rounded-xl mt-auto ${
      isDarkMode
        ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
        : 'text-red-600 hover:text-red-800 hover:bg-red-200'
    }`}
    title="로그아웃"
  >
    <ArrowRightOnRectangleIcon className="w-6 h-6" />
  </button>

  <button
    onClick={() => setIsDarkMode(prev => !prev)}
    className={`p-3 rounded-xl ${
      isDarkMode
        ? 'text-gray-400 hover:text-white hover:bg-discord-hover'
        : 'text-gray-600 hover:text-black hover:bg-gray-300'
    }`}
    title="다크/라이트 전환"
  >
    {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
  </button>
</aside>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 p-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>대시보드</h1>
          <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            회의실을 만들거나 참가해보세요
          </p>
        </div>

        {/* 빠른 액션 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreateModal(true)}
            className={`p-6 rounded-lg hover:shadow-lg transition-shadow ${
              isDarkMode
                ? 'bg-gradient-to-r from-discord-brand to-zoom-blue text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <PlusIcon className="w-8 h-8 mb-3" />
            <h3 className="text-lg font-semibold mb-1">새 회의 시작</h3>
            <p className="text-sm opacity-90">
              즉시 화상회의를 시작하세요
            </p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              const code = prompt('회의 코드를 입력하세요:');
              if (code) {
                // 코드로 방 찾기 또는 참가
                const room = rooms.find(r => r.id === code || r.name === code);
                if (room) {
                  handleJoinRoom(room.id);
                } else {
                  toast.error('해당 코드의 회의를 찾을 수 없습니다');
                }
              }
            }}
            className={`p-6 rounded-lg transition-colors cursor-pointer ${
              isDarkMode
                ? 'bg-discord-light text-white border border-gray-700 hover:border-gray-600'
                : 'bg-gray-100 text-gray-800 border border-gray-300 hover:bg-gray-200'
            }`}
          >
            <UserGroupIcon className="w-8 h-8 mb-3" />
            <h3 className="text-lg font-semibold mb-1">회의 참가</h3>
            <p className="text-sm text-gray-400">
              초대 코드로 회의에 참가하세요
            </p>
          </motion.button>
        </div>

        {/* 활성 회의실 목록 */}
        <div>
          <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            활성 회의실
          </h2>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner w-8 h-8 border-3" />
            </div>
          ) : rooms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-lg p-4 transition-colors ${
                    isDarkMode
                      ? 'bg-discord-light border border-gray-700 hover:border-discord-brand'
                      : 'bg-white border border-gray-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`${isDarkMode ? 'text-white' : 'text-gray-900'} font-medium`}>{room.name}</h3>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {room.participants.length}/{room.maxParticipants}명 참가 중
                      </p>
                    </div>
                    <VideoCameraIcon className="w-5 h-5 text-discord-brand" />
                  </div>
                  
                  <div className={`flex items-center text-xs mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    <ClockIcon className="w-4 h-4 mr-1" />
                    {new Date(room.createdAt).toLocaleString()}
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('버튼 클릭 이벤트 발생!', room.id);
                      handleJoinRoom(room.id);
                    }}
                    onMouseDown={(e) => {
                      console.log('마우스 다운 이벤트!', room.id);
                    }}
                    className="w-full btn-discord py-2 text-sm"
                    type="button"
                  >
                    참가하기
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className={`text-center py-12 rounded-lg border ${
              isDarkMode ? 'bg-discord-light border-gray-700' : 'bg-gray-100 border-gray-300'
            }`}>
              <VideoCameraIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>활성 회의실이 없습니다</p>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                새 회의를 시작해보세요!
              </p>
            </div>
          )}
        </div>
      </main>

      {/* 새 방 만들기 모달 */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">
                  새 회의 만들기
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  회의 이름
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="input-field"
                  placeholder="예: 팀 미팅"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCreateRoom}
                  className="flex-1 btn-discord"
                >
                  만들기
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 btn-zoom"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 개인 코드 모달 */}
      <AnimatePresence>
        {showPersonalCode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowPersonalCode(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-discord-brand to-zoom-blue rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardDocumentCheckIcon className="w-8 h-8 text-white" />
                </div>
                
                <h2 className="text-xl font-semibold text-white mb-2">
                  내 개인 참가 코드
                </h2>
                
                <p className="text-gray-400 text-sm mb-4">
                  이 코드를 공유하여 다른 사람을 초대하세요
                </p>

                <div className="bg-discord-darker rounded-lg p-4 mb-4">
                  <p className="text-2xl font-mono text-discord-brand">
                    {user?.personalCode}
                  </p>
                </div>

                <button
                  onClick={copyPersonalCode}
                  className="btn-discord w-full"
                >
                  코드 복사하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 설정 모달 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">
                  설정
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* 사용자 정보 */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">사용자 정보</h3>
                  <div className="bg-discord-darker rounded-lg p-4 space-y-3">
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

                {/* 테마 설정 */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">테마</h3>
                  <div className="bg-discord-darker rounded-lg p-4">
                    <label className="flex items-center justify-between">
                      <span className="text-gray-400">다크 모드</span>
                      <button className="px-3 py-1 rounded bg-discord-brand text-white text-sm">
                        켜짐
                      </button>
                    </label>
                  </div>
                </div>

                {/* 알림 설정 */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">알림</h3>
                  <div className="bg-discord-darker rounded-lg p-4 space-y-3">
                    <label className="flex items-center justify-between">
                      <span className="text-gray-400">새 메시지 알림</span>
                      <button className="px-3 py-1 rounded bg-green-600 text-white text-sm">
                        켜짐
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-gray-400">회의 참가 알림</span>
                      <button className="px-3 py-1 rounded bg-green-600 text-white text-sm">
                        켜짐
                      </button>
                    </label>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}