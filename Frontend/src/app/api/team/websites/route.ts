import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

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
    const teamsCollection = adminDb.collection('teams');
    const teamsQuery = teamsCollection.where('apiKey', '==', teamApiKey);
    
    const teamsSnapshot = await teamsQuery.get();
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
    const websitesCollection = adminDb.collection('websites');
    const websitesQuery = websitesCollection
      .where('teamId', '==', teamId)
      .where('isActive', '==', true);
    
    const websitesSnapshot = await websitesQuery.get();
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