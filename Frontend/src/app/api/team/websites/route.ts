import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  try {
    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Use: Bearer <team_api_key>' },
        { status: 401 }
      );
    }

    const teamApiKey = authHeader.replace('Bearer ', '');

    // Find team by API key
    const teamsQuery = query(
      collection(db, 'teams'),
      where('apiKey', '==', teamApiKey)
    );
    
    const teamsSnapshot = await getDocs(teamsQuery);
    
    if (teamsSnapshot.empty) {
      return NextResponse.json(
        { error: 'Invalid team API key' },
        { status: 401 }
      );
    }

    const teamDoc = teamsSnapshot.docs[0];
    const teamId = teamDoc.id;
    
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

    return NextResponse.json({
      success: true,
      teamId: teamId,
      teamName: teamDoc.data().name,
      websiteCount: websites.length,
      websites: websites
    });

  } catch (error) {
    console.error('Error fetching team websites:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}