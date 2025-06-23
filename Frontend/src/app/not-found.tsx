import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-2xl text-center">
        <div>
          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ไม่พบหน้าที่ต้องการ
          </h2>
          <p className="text-gray-600 mb-6">
            ขออภัย หน้าที่คุณกำลังค้นหาไม่มีอยู่ในระบบ
          </p>
        </div>
        <div className="space-y-4">
          <Link
            href="/"
            className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            กลับหน้าแรก
          </Link>
          <Link
            href="/login"
            className="block w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
} 