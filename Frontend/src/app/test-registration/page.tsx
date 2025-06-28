'use client';

import React from 'react';
import RegistrationTester from '../../components/RegistrationTester';
import Link from 'next/link';

export default function TestRegistrationPage() {
  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            หน้านี้ใช้ได้เฉพาะใน Development Mode
          </h1>
          <Link href="/" className="text-blue-600 hover:underline">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-6">
          <Link 
            href="/register" 
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            ← กลับไปหน้าสมัครสมาชิก
          </Link>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🧪 ทดสอบระบบสมัครสมาชิก
          </h1>
          <p className="text-gray-600">
            เครื่องมือสำหรับทดสอบและ debug ปัญหาการสมัครสมาชิก
          </p>
        </div>
        
        <RegistrationTester />
        
        <div className="mt-8 p-6 bg-blue-50 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-800 mb-3">
            📝 ขั้นตอนการทดสอบ
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-700">
            <li>กรอกชื่อผู้ใช้ที่ต้องการทดสอบ (เช่น "testuser123")</li>
            <li>คลิก "Test Registration" เพื่อทดสอบการสมัครสมาชิกแบบเต็มรูปแบบ</li>
            <li>ดูผลลัพธ์ในแต่ละขั้นตอน:</li>
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
              <li>✅ สีเขียว = สำเร็จ</li>
              <li>❌ สีแดง = ล้มเหลว</li>
              <li>🧹 สีเหลือง = การทำความสะอาด</li>
            </ul>
            <li>หากมีปัญหา ใช้ "Check Data" เพื่อตรวจสอบข้อมูลในฐานข้อมูล</li>
            <li>ใช้ "Repair Data" หากข้อมูลมีปัญหา</li>
          </ol>
        </div>

        <div className="mt-6 p-6 bg-yellow-50 rounded-lg">
          <h2 className="text-xl font-semibold text-yellow-800 mb-3">
            ⚠️ หมายเหตุสำคัญ
          </h2>
          <ul className="list-disc list-inside space-y-2 text-yellow-700">
            <li>เครื่องมือนี้จะสร้างข้อมูลจริงในฐานข้อมูล</li>
            <li>ใช้เฉพาะสำหรับการทดสอบ ไม่ใช่การสมัครสมาชิกจริง</li>
            <li>ข้อมูลที่สร้างขึ้นสามารถลบได้ด้วยเครื่องมือ cleanup</li>
            <li>หากพบปัญหา ให้บันทึก console logs เพื่อ debug</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 