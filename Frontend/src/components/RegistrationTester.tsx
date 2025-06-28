'use client';

import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { debugRegistration, checkExistingData } from '../utils/debugRegistration';
import { validateAndRepairUserData } from '../utils/userValidation';

export default function RegistrationTester() {
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('testpass123');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [existingData, setExistingData] = useState<any>(null);

  const handleTestRegistration = async () => {
    if (!testUsername) return;
    
    setIsLoading(true);
    try {
      console.log('🔍 Starting registration test for:', testUsername);
      
      // Step 1: Check existing data first
      const existing = await checkExistingData(testUsername);
      setExistingData(existing);
      console.log('📊 Existing data check:', existing);
      
      // Step 2: Run debug registration
      const debugResults = await debugRegistration(testUsername, testPassword);
      setResults(debugResults);
      console.log('🧪 Debug results:', debugResults);
      
      // Step 3: If registration succeeded, validate data
      const lastResult = debugResults[debugResults.length - 1];
      if (lastResult.success && lastResult.step === '6. Verify Data Written') {
        console.log('✅ Registration completed successfully');
        
        // Additional validation
        setTimeout(async () => {
          try {
            const recheck = await checkExistingData(testUsername);
            console.log('🔄 Re-check after registration:', recheck);
            setExistingData(recheck);
          } catch (error) {
            console.error('❌ Re-check failed:', error);
          }
        }, 2000);
      }
      
    } catch (error: any) {
      console.error('❌ Test failed:', error);
      setResults([{
        step: 'Test Error',
        success: false,
        error: error.message
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckUsernames = async () => {
    if (!testUsername) return;
    
    setIsLoading(true);
    try {
      // Check usernames collection directly
      const usernameDoc = await getDoc(doc(db, 'usernames', testUsername));
      console.log('📋 Usernames collection check:', {
        exists: usernameDoc.exists(),
        data: usernameDoc.exists() ? usernameDoc.data() : null
      });
      
      // Check users collection if username exists
      if (usernameDoc.exists()) {
        const usernameData = usernameDoc.data();
        if (usernameData?.uid) {
          const userDoc = await getDoc(doc(db, 'users', usernameData.uid));
          console.log('👤 Users collection check:', {
            exists: userDoc.exists(),
            data: userDoc.exists() ? userDoc.data() : null
          });
        }
      }
      
      const existing = await checkExistingData(testUsername);
      setExistingData(existing);
      
    } catch (error: any) {
      console.error('❌ Check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepairData = async () => {
    if (!testUsername || !existingData?.usernameData?.uid) return;
    
    setIsLoading(true);
    try {
      const fakeEmail = `${testUsername}@app.local`;
      const validation = await validateAndRepairUserData(
        existingData.usernameData.uid,
        testUsername,
        fakeEmail
      );
      
      console.log('🔧 Repair result:', validation);
      
      // Re-check data after repair
      const recheck = await checkExistingData(testUsername);
      setExistingData(recheck);
      
    } catch (error: any) {
      console.error('❌ Repair failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStepIcon = (step: any) => {
    if (step.success) return '✅';
    if (step.step.includes('Cleanup')) return '🧹';
    return '❌';
  };

  const getStepColor = (step: any) => {
    if (step.success) return 'text-green-600';
    if (step.step.includes('Cleanup')) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">🧪 Registration Tester</h2>
      
      {/* Test Controls */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Test Username
            </label>
            <input
              type="text"
              value={testUsername}
              onChange={(e) => setTestUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter username to test"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Test Password
            </label>
            <input
              type="password"
              value={testPassword}
              onChange={(e) => setTestPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleTestRegistration}
            disabled={isLoading || !testUsername}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? '🔄 Testing...' : '🧪 Test Registration'}
          </button>
          
          <button
            onClick={handleCheckUsernames}
            disabled={isLoading || !testUsername}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            📋 Check Data
          </button>
          
          {existingData?.usernameData?.uid && (
            <button
              onClick={handleRepairData}
              disabled={isLoading}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              🔧 Repair Data
            </button>
          )}
        </div>
      </div>

      {/* Existing Data Status */}
      {existingData && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-3 text-blue-800">📊 Current Data Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-3 rounded-lg ${existingData.usernameExists ? 'bg-green-100' : 'bg-red-100'}`}>
              <div className="font-medium">Usernames Collection</div>
              <div className={existingData.usernameExists ? 'text-green-600' : 'text-red-600'}>
                {existingData.usernameExists ? '✅ Exists' : '❌ Missing'}
              </div>
              {existingData.usernameData && (
                <div className="text-xs mt-1 text-gray-600">
                  UID: {existingData.usernameData.uid?.substring(0, 8)}...
                </div>
              )}
            </div>
            
            <div className={`p-3 rounded-lg ${existingData.userExists ? 'bg-green-100' : 'bg-red-100'}`}>
              <div className="font-medium">Users Collection</div>
              <div className={existingData.userExists ? 'text-green-600' : 'text-red-600'}>
                {existingData.userExists ? '✅ Exists' : '❌ Missing'}
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-gray-100">
              <div className="font-medium">Issues Found</div>
              <div className={existingData.issues.length > 0 ? 'text-red-600' : 'text-green-600'}>
                {existingData.issues.length === 0 ? '✅ None' : `⚠️ ${existingData.issues.length}`}
              </div>
            </div>
          </div>
          
          {existingData.issues.length > 0 && (
            <div className="mt-3">
              <div className="font-medium text-red-700 mb-2">Issues:</div>
              <ul className="list-disc list-inside text-sm text-red-600">
                {existingData.issues.map((issue: string, index: number) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Test Results */}
      {results.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">🔍 Test Results</h3>
          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border-l-4 ${
                  result.success 
                    ? 'bg-green-50 border-green-400' 
                    : result.step.includes('Cleanup')
                    ? 'bg-yellow-50 border-yellow-400'
                    : 'bg-red-50 border-red-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`font-medium ${getStepColor(result)}`}>
                      {getStepIcon(result)} {result.step}
                    </div>
                    {result.error && (
                      <div className="text-red-600 text-sm mt-1">
                        Error: {result.error}
                      </div>
                    )}
                    {result.details && (
                      <div className="text-gray-600 text-sm mt-1">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-yellow-800">💡 How to Use</h3>
        <ol className="list-decimal list-inside text-sm text-yellow-700 space-y-1">
          <li>Enter a test username (use something like "test123")</li>
          <li>Click "Test Registration" to run full registration test</li>
          <li>Check the results to see which step failed</li>
          <li>Use "Check Data" to verify current database state</li>
          <li>Use "Repair Data" if data exists but has issues</li>
        </ol>
      </div>
    </div>
  );
} 