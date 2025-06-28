'use client';

import React, { useState } from 'react';
import { debugRegistration, checkExistingData } from '../utils/debugRegistration';

export default function DebugRegistration() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [existingData, setExistingData] = useState<any>(null);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleDebugRegistration = async () => {
    if (!username || !password) return;
    
    setIsLoading(true);
    setResults([]);
    
    try {
      const debugResults = await debugRegistration(username, password);
      setResults(debugResults);
    } catch (error) {
      console.error('Debug registration failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckExisting = async () => {
    if (!username) return;
    
    try {
      const data = await checkExistingData(username);
      setExistingData(data);
    } catch (error) {
      console.error('Check existing data failed:', error);
    }
  };

  return (
    <div className="fixed top-4 left-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-lg max-w-md z-50">
      <div className="space-y-4">
        <div className="text-sm font-bold text-gray-900 dark:text-white">
          🔧 Registration Debug Tool
        </div>
        
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm"
          />
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={handleDebugRegistration}
            disabled={isLoading || !username || !password}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-xs py-2 px-3 rounded"
          >
            {isLoading ? 'Testing...' : 'Test Registration'}
          </button>
          
          <button
            onClick={handleCheckExisting}
            disabled={!username}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-xs py-2 px-3 rounded"
          >
            Check Existing
          </button>
        </div>
        
        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <div className="text-xs font-bold text-gray-700 dark:text-gray-300">Debug Results:</div>
            {results.map((result, index) => (
              <div key={index} className={`text-xs p-2 rounded ${
                result.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 
                'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                <div className="font-medium">{result.step}</div>
                {result.error && <div className="text-red-600 dark:text-red-400">Error: {result.error}</div>}
                {result.details && (
                  <div className="mt-1 text-xs opacity-75">
                    {JSON.stringify(result.details, null, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Existing Data */}
        {existingData && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-700 dark:text-gray-300">Existing Data:</div>
            <div className="text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <div>Username exists: {existingData.usernameExists ? '✅' : '❌'}</div>
              <div>User exists: {existingData.userExists ? '✅' : '❌'}</div>
              {existingData.issues.length > 0 && (
                <div className="mt-1 text-red-600 dark:text-red-400">
                  Issues: {existingData.issues.join(', ')}
                </div>
              )}
              {existingData.usernameData && (
                <div className="mt-1">
                  <div className="font-medium">Username Data:</div>
                  <pre className="text-xs">{JSON.stringify(existingData.usernameData, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Development mode only
        </div>
      </div>
    </div>
  );
} 