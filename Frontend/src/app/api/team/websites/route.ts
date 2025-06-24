import { NextRequest, NextResponse } from 'next/server';

// Mock data for testing - will be replaced with actual database query
const mockTeamData = {
  'ABC123XYZ456DEF789GHI012JKL345MN': {
    teamId: 'team1',
    teamName: 'ทีมทดสอบ',
    websites: [
      {
        name: 'เว็บไซต์ทดสอบ 1',
        url: 'https://test1.com',
        apiKey: 'web_api_key_1',
        balance: 1500.50
      },
      {
        name: 'เว็บไซต์ทดสอบ 2', 
        url: 'https://test2.com',
        apiKey: 'web_api_key_2',
        balance: 2300.75
      }
    ]
  }
};

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

    // Check if team exists in mock data
    const teamData = mockTeamData[teamApiKey as keyof typeof mockTeamData];
    
    if (!teamData) {
      console.log('No team found with provided API key');
      return NextResponse.json(
        { error: 'Invalid team API key' },
        { status: 401 }
      );
    }

    console.log('Found team:', teamData.teamId);
    console.log('Returning response with', teamData.websites.length, 'websites');
    
    return NextResponse.json({
      success: true,
      teamId: teamData.teamId,
      teamName: teamData.teamName,
      websiteCount: teamData.websites.length,
      websites: teamData.websites
    });

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