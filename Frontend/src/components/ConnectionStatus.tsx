import React, { useState, useEffect } from 'react';
import { connectionState } from '../lib/firebase';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
}

export default function ConnectionStatus({ className = '', showDetails = false }: ConnectionStatusProps) {
  const [isConnected, setIsConnected] = useState(connectionState.isConnected);
  const [reconnectAttempts, setReconnectAttempts] = useState(connectionState.reconnectAttempts);
  const [listenerCount, setListenerCount] = useState(connectionState.listeners.size);
  const [showFullStatus, setShowFullStatus] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(connectionState.isConnected);
      setReconnectAttempts(connectionState.reconnectAttempts);
      setListenerCount(connectionState.listeners.size);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (!isConnected) return 'text-red-500';
    if (reconnectAttempts > 0) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusDot = () => {
    if (!isConnected) return 'bg-red-500';
    if (reconnectAttempts > 0) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!isConnected) return 'ขาดการเชื่อมต่อ';
    if (reconnectAttempts > 0) return 'กำลังเชื่อมต่อใหม่';
    return 'เชื่อมต่อแล้ว';
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  if (!showDetails) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className={`w-2 h-2 rounded-full ${getStatusDot()}`}></div>
        <span className={`text-sm ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${getStatusDot()}`}></div>
          <div>
            <h3 className="font-medium text-gray-900">สถานะการเชื่อมต่อ</h3>
            <p className={`text-sm ${getStatusColor()}`}>{getStatusText()}</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowFullStatus(!showFullStatus)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          {showFullStatus ? 'ซ่อน' : 'แสดง'} รายละเอียด
        </button>
      </div>

      {showFullStatus && (
        <div className="mt-4 pt-4 border-t space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">การเชื่อมต่อ:</span>
              <span className={`ml-2 font-medium ${getStatusColor()}`}>
                {isConnected ? 'ปกติ' : 'ขาดการเชื่อมต่อ'}
              </span>
            </div>
            
            <div>
              <span className="text-gray-500">ความพยายามเชื่อมต่อ:</span>
              <span className="ml-2 font-medium text-gray-900">
                {reconnectAttempts}
              </span>
            </div>
            
            <div>
              <span className="text-gray-500">Listeners ที่ใช้งาน:</span>
              <span className="ml-2 font-medium text-gray-900">
                {listenerCount}
              </span>
            </div>
            
            <div>
              <span className="text-gray-500">Active Listeners:</span>
              <span className="ml-2 font-medium text-gray-900">
                {Array.from(connectionState.listeners).length}
              </span>
            </div>
          </div>

          {Array.from(connectionState.listeners).length > 0 && (
            <div className="mt-3">
              <span className="text-gray-500 text-sm">Active Listeners:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {Array.from(connectionState.listeners).map(listener => (
                  <span 
                    key={listener}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                  >
                    {listener}
                  </span>
                ))}
              </div>
            </div>
          )}

          {reconnectAttempts > 0 && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                <span className="ml-2 text-sm text-yellow-800">
                  กำลังเชื่อมต่อใหม่... (ครั้งที่ {reconnectAttempts})
                </span>
              </div>
            </div>
          )}

          {!isConnected && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-800">
                  ❌ ขาดการเชื่อมต่อกับ Firebase
                </span>
                <button
                  onClick={handleRefresh}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                >
                  รีโหลดหน้า
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-500">
            <p>• หากเห็นสถานะ "ขาดการเชื่อมต่อ" บ่อยครั้ง อาจเป็นปัญหาเครือข่าย</p>
            <p>• ระบบจะพยายามเชื่อมต่อใหม่อัตโนมัติเมื่อขาดการเชื่อมต่อ</p>
            <p>• หากปัญหายังคงอยู่ ให้กดปุ่ม "รีโหลดหน้า"</p>
          </div>
        </div>
      )}
    </div>
  );
} 