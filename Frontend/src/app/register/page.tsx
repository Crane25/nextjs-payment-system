'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { EyeIcon, EyeSlashIcon, UserIcon, LockClosedIcon, UserPlusIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import DebugRegistration from '../../components/DebugRegistration';
import RegistrationTester from '../../components/RegistrationTester';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (username.length < 3) {
      toast.error('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      toast.error('ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษร ตัวเลข และ _');
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error('รหัสผ่านไม่ตรงกัน');
      return;
    }

    if (password.length < 6) {
      toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setIsLoading(true);

    try {
      await signUp(username, password);
      toast.success('สมัครสมาชิกสำเร็จ!');
      router.push('/dashboard');
    } catch (error: any) {
      // Registration error - provide user-friendly messages
      if (error.message === 'Username already exists') {
        toast.error('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
      } else if (error.code === 'auth/weak-password') {
        toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      } else if (error.message.includes('Database access denied')) {
        toast.error('ไม่สามารถสร้างบัญชีได้ในขณะนี้');
      } else if (error.message.includes('Database is currently unavailable')) {
        toast.error('บริการไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      } else if (error.message.includes('Firebase not initialized')) {
        toast.error('บริการไม่พร้อมใช้งาน กรุณารอสักครู่แล้วลองใหม่');
      } else {
        toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Debug Registration Tools */}
      {process.env.NODE_ENV === 'development' && (
        <>
          <DebugRegistration />
          <div className="fixed bottom-4 right-4 max-w-sm">
            <div className="bg-white/10 backdrop-blur-lg p-4 rounded-lg shadow-lg border border-white/20">
              <RegistrationTester />
            </div>
          </div>
        </>
      )}
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10 animate-pulse delay-500"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-white/10 animate-pulse delay-1500"></div>
        <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full bg-white/5 animate-spin" style={{animationDuration: '25s'}}></div>
        <div className="absolute bottom-1/4 left-1/4 w-48 h-48 rounded-full bg-white/5 animate-spin" style={{animationDuration: '15s'}}></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Glass morphism card */}
        <div className="bg-white/20 backdrop-blur-lg p-8 rounded-3xl shadow-2xl border border-white/30 transform transition-all duration-500 hover:scale-105">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-20 h-20 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <UserPlusIcon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              เริ่มต้นใหม่
            </h2>
            <p className="text-white/80 text-sm">
              สร้างบัญชีเพื่อเข้าใช้งานระบบ
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username field */}
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-white/90">
                ชื่อผู้ใช้
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-white/60" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="block w-full pl-10 pr-3 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-300"
                  placeholder="กรอกชื่อผู้ใช้"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <p className="text-white/60 text-xs">
                ใช้ได้เฉพาะตัวอักษร ตัวเลข และ _ (อย่างน้อย 3 ตัวอักษร)
              </p>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-white/90">
                รหัสผ่าน
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-white/60" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="block w-full pl-10 pr-12 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-300"
                  placeholder="กรอกรหัสผ่าน"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password field */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/90">
                ยืนยันรหัสผ่าน
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-white/60" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  className="block w-full pl-10 pr-12 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-300"
                  placeholder="ยืนยันรหัสผ่าน"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-white/60 hover:text-white transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex items-center justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  กำลังสมัครสมาชิก...
                </div>
              ) : (
                <div className="flex items-center">
                  สมัครสมาชิก
                  <ArrowRightIcon className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </button>
          </form>

          {/* Sign in link */}
          <div className="mt-6 text-center">
            <p className="text-white/80 text-sm">
              มีบัญชีอยู่แล้ว?{' '}
              <Link 
                href="/login" 
                className="font-medium text-white hover:text-white/80 transition-colors underline decoration-2 underline-offset-2 hover:decoration-white/60"
              >
                เข้าสู่ระบบที่นี่
              </Link>
            </p>
          </div>
        </div>

        {/* Footer text */}
        <div className="text-center">
          <p className="text-white/60 text-xs">
            เริ่มต้นการจัดการการเงินอย่างง่ายดาย
          </p>
        </div>
      </div>
    </div>
  );
} 