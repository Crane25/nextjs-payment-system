'use client';

import { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function TeamWebsitesProxy() {
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTeamWebsites = async () => {
    if (!apiKey.trim()) {
      setError('กรุณาใส่ Team API Key');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Find team by API key
      const teamsQuery = query(
        collection(db, 'teams'),
        where('apiKey', '==', apiKey.trim())
      );
      
      const teamsSnapshot = await getDocs(teamsQuery);
      
      if (teamsSnapshot.empty) {
        setError('ไม่พบทีมที่ใช้ API Key นี้');
        setLoading(false);
        return;
      }

      const teamDoc = teamsSnapshot.docs[0];
      const teamId = teamDoc.id;
      const teamName = teamDoc.data().name;
      
      // Get websites for this team that are active
      const websitesQuery = query(
        collection(db, 'websites'),
        where('teamId', '==', teamId),
        where('isActive', '==', true)
      );
      
      const websitesSnapshot = await getDocs(websitesQuery);
      
      // Format website data
      const websites = websitesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          name: data.name || 'ไม่ระบุชื่อ',
          url: data.url || '',
          apiKey: data.apiKey || '',
          balance: data.balance || 0
        };
      });

      const response = {
        success: true,
        teamId: teamId,
        teamName: teamName,
        websiteCount: websites.length,
        websites: websites
      };

      setResult(response);
      setLoading(false);

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ');
      setLoading(false);
    }
  };

  const copyAsJson = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      alert('คัดลอก JSON แล้ว!');
    }
  };

  const copyAsCurl = () => {
    if (apiKey) {
      const curlCommand = `curl -H "Authorization: Bearer ${apiKey}" https://scjsnext.com/api/team/websites`;
      navigator.clipboard.writeText(curlCommand);
      alert('คัดลอกคำสั่ง curl แล้ว!');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Team Websites API Proxy
          </h1>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Team API Key
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ใส่ Team API Key ที่ได้จากหน้า /team"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={fetchTeamWebsites}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'กำลังโหลด...' : 'ดึงข้อมูล'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-red-700 dark:text-red-300">❌ {error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={copyAsJson}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  📋 คัดลอก JSON
                </button>
                <button
                  onClick={copyAsCurl}
                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                >
                  📋 คัดลอก curl command
                </button>
              </div>
              
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  API Response:
                </h3>
                <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
              📘 วิธีใช้งาน:
            </h3>
            <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <li>1. ไปที่หน้า <a href="/team" className="underline">/team</a> เพื่อดู Team API Key</li>
              <li>2. คัดลอก API Key จากการ์ดทีม</li>
              <li>3. วางใส่ในช่องด้านบนแล้วกดปุ่ม "ดึงข้อมูล"</li>
              <li>4. ใช้ปุ่ม "คัดลอก JSON" เพื่อเอาผลลัพธ์ไปใช้</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}