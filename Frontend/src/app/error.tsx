'use client';

import React from 'react';
import { config } from '../config/env';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-2xl text-center">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
            เกิดข้อผิดพลาด
          </h2>
          <p className="text-gray-600 mb-6">
            ขออภัย เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง
          </p>
          {config.app.isDevelopment && (
            <p className="text-sm text-gray-500 mb-6 font-mono bg-gray-100 p-2 rounded">
              {error.message}
            </p>
          )}
        </div>
        <div className="space-y-4">
          <button
            onClick={reset}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            ลองใหม่อีกครั้ง
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            กลับหน้าแรก
          </button>
        </div>
      </div>
    </div>
  );
} 