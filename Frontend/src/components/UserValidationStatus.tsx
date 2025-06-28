'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { validateUserData, repairUsernameData } from '../utils/userValidation';
import { CheckCircleIcon, ExclamationTriangleIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

interface ValidationStatusProps {
  showInDevelopment?: boolean;
}

export default function UserValidationStatus({ showInDevelopment = true }: ValidationStatusProps) {
  const { user } = useAuth();
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  // Only show in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!showInDevelopment || !isDevelopment || !user) {
    return null;
  }

  const checkValidation = async () => {
    if (!user?.displayName) return;
    
    setIsValidating(true);
    try {
      const result = await validateUserData(user.uid, user.displayName);
      setValidationResult(result);
    } catch (error) {
      console.error('Validation check failed:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const repairData = async () => {
    if (!user?.displayName || !user?.email) return;
    
    setIsRepairing(true);
    try {
      const success = await repairUsernameData(user.uid, user.displayName, user.email);
      if (success) {
        // Re-check validation after repair
        await checkValidation();
      }
    } catch (error) {
      console.error('Repair failed:', error);
    } finally {
      setIsRepairing(false);
    }
  };

  useEffect(() => {
    if (user?.displayName) {
      checkValidation();
    }
  }, [user?.displayName]);

  if (!validationResult) {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded-lg p-3 shadow-lg max-w-sm">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-sm text-blue-700 dark:text-blue-300">กำลังตรวจสอบข้อมูล...</span>
        </div>
      </div>
    );
  }

  const getStatusColor = () => {
    if (validationResult.isValid) return 'green';
    return 'red';
  };

  const statusColor = getStatusColor();

  return (
    <div className={`fixed bottom-4 right-4 bg-${statusColor}-50 dark:bg-${statusColor}-900 border border-${statusColor}-200 dark:border-${statusColor}-700 rounded-lg p-3 shadow-lg max-w-sm`}>
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {validationResult.isValid ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
            )}
            <span className={`text-sm font-medium text-${statusColor}-700 dark:text-${statusColor}-300`}>
              {validationResult.isValid ? 'ข้อมูลถูกต้อง' : 'พบปัญหาข้อมูล'}
            </span>
          </div>
          
          <button
            onClick={checkValidation}
            disabled={isValidating}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {isValidating ? '...' : '🔄'}
          </button>
        </div>

        {/* Status Details */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${validationResult.hasUserEntry ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Users Collection: {validationResult.hasUserEntry ? 'มี' : 'ไม่มี'}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${validationResult.hasUsernameEntry ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Usernames Collection: {validationResult.hasUsernameEntry ? 'มี' : 'ไม่มี'}
            </span>
          </div>
        </div>

        {/* Issues */}
        {validationResult.issues && validationResult.issues.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-red-600 dark:text-red-400">ปัญหาที่พบ:</div>
            {validationResult.issues.map((issue: string, index: number) => (
              <div key={index} className="text-xs text-red-600 dark:text-red-400 pl-2">
                • {issue}
              </div>
            ))}
          </div>
        )}

        {/* Repair Button */}
        {!validationResult.isValid && (
          <button
            onClick={repairData}
            disabled={isRepairing}
            className="w-full flex items-center justify-center space-x-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-xs py-1 px-2 rounded transition-colors"
          >
            <WrenchScrewdriverIcon className="h-3 w-3" />
            <span>{isRepairing ? 'กำลังซ่อมแซม...' : 'ซ่อมแซมข้อมูล'}</span>
          </button>
        )}

        {/* User Info */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            User: {user?.displayName} ({user?.uid?.substring(0, 8)}...)
          </div>
        </div>
      </div>
    </div>
  );
} 