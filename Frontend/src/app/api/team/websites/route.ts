import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  try {
    console.log('API called: /api/team/websites');
    
    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    console.log('Authorization header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Invalid authorization header format');
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Use: Bearer <team_api_key>' },
        { status: 401 }
      );
    }

    const teamApiKey = authHeader.replace('Bearer ', '');
    console.log('Team API key length:', teamApiKey.length);

    // Find team by API key
    console.log('Querying teams with API key...');
    const teamsQuery = query(
      collection(db, 'teams'),
      where('apiKey', '==', teamApiKey)
    );
    
    const teamsSnapshot = await getDocs(teamsQuery);
    console.log('Teams query result:', teamsSnapshot.size, 'teams found');
    
    if (teamsSnapshot.empty) {
      console.log('No team found with provided API key');
      return NextResponse.json(
        { error: 'Invalid team API key' },
        { status: 401 }
      );
    }

    const teamDoc = teamsSnapshot.docs[0];
    const teamId = teamDoc.id;
    console.log('Found team:', teamId);
    
    // Get websites for this team that are active
    console.log('Querying websites for team:', teamId);
    const websitesQuery = query(
      collection(db, 'websites'),
      where('teamId', '==', teamId),
      where('isActive', '==', true)
    );
    
    const websitesSnapshot = await getDocs(websitesQuery);
    console.log('Websites query result:', websitesSnapshot.size, 'websites found');
    
    // Format website data
    const websites = websitesSnapshot.docs.map(doc => {
      const data = doc.data();
      console.log('Processing website:', data.name);
      return {
        name: data.name || 'ไม่ระบุชื่อ',
        url: data.url || '',
        apiKey: data.apiKey || '',
        balance: data.balance || 0
      };
    });

    console.log('Returning response with', websites.length, 'websites');
    return NextResponse.json({
      success: true,
      teamId: teamId,
      teamName: teamDoc.data().name,
      websiteCount: websites.length,
      websites: websites
    });

  } catch (error) {
    console.error('Error fetching team websites:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}