import React from 'react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
        <h2 className="text-white text-xl font-semibold">กำลังโหลด...</h2>
        <p className="text-blue-100 mt-2">กรุณารอสักครู่</p>
      </div>
    </div>
  );
} 