import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Temporarily allow unauthenticated reads for API testing
// This is a workaround for the admin SDK credentials issue

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

    try {
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
      const teamName = teamDoc.data().name;
      
      // Get websites for this team
      const websitesQuery = query(
        collection(db, 'websites'),
        where('teamId', '==', teamId)
      );
      
      const websitesSnapshot = await getDocs(websitesQuery);
      
      // Format website data (only include websites with status === 'active')
      const websites = websitesSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          const status = data.status;
          // Include if status is 'active'
          return status === 'active';
        })
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id, // เพิ่ม website ID สำหรับการอ้างอิง
            name: data.name || 'ไม่ระบุชื่อ',
            url: data.url || '',
            apiKey: data.apiKey || '',
            balance: data.balance || 0
          };
        });
      
      return NextResponse.json({
        success: true,
        teamId: teamId,
        teamName: teamName,
        websiteCount: websites.length,
        websites: websites
      });

    } catch (dbError) {
      console.error('Database query error:', dbError);
      // If Firebase query fails, return informative error
      return NextResponse.json(
        { 
          error: 'Database connection failed',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error',
          note: 'The API requires Firebase security rules to allow read access, or proper authentication setup'
        },
        { status: 503 }
      );
    }

  } catch (error) {
    console.error('Error fetching team websites:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}