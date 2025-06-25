import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Temporarily allow unauthenticated reads for API testing
// This is a workaround for the admin SDK credentials issue

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
    console.log('Team API key:', teamApiKey);

    try {
      // Find team by API key
      console.log('Querying teams collection...');
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
      const teamName = teamDoc.data().name;
      console.log('Found team:', teamId, 'name:', teamName);
      
      // Debug: Check all websites for this team first (without isActive filter)
      console.log('=== DEBUGGING WEBSITES ===');
      console.log('Team ID:', teamId);
      
      const allWebsitesQuery = query(
        collection(db, 'websites'),
        where('teamId', '==', teamId)
      );
      
      const allWebsitesSnapshot = await getDocs(allWebsitesQuery);
      console.log('All websites for team (without isActive filter):', allWebsitesSnapshot.size);
      
      allWebsitesSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Website ${index + 1}:`, {
          id: doc.id,
          name: data.name,
          teamId: data.teamId,
          status: data.status,
          url: data.url
        });
      });
      
      // Now get websites that are active (treat undefined as active for backward compatibility)
      console.log('Querying ACTIVE websites for team:', teamId);
      const websitesQuery = query(
        collection(db, 'websites'),
        where('teamId', '==', teamId)
      );
      
      const websitesSnapshot = await getDocs(websitesQuery);
      console.log('Active websites query result:', websitesSnapshot.size, 'websites found');
      
      // Format website data (only include websites with status === 'active')
      const websites = websitesSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          const status = data.status;
          console.log('Checking website:', data.name, 'status:', status);
          // Include if status is 'active'
          return status === 'active';
        })
        .map(doc => {
          const data = doc.data();
          console.log('Processing website:', data.name, 'status:', data.status);
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