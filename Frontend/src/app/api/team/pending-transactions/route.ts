import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  try {
    console.log('API called: /api/team/pending-transactions');
    
    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    console.log('Authorization header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Invalid authorization header format');
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing or invalid Authorization header. Use: Bearer <team_api_key>' 
        },
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
          { 
            success: false,
            error: 'Invalid team API key' 
          },
          { status: 401 }
        );
      }

      const teamDoc = teamsSnapshot.docs[0];
      const teamId = teamDoc.id;
      const teamName = teamDoc.data().name;
      console.log('Found team:', teamId, 'name:', teamName);
      
      // Get pending transactions (status = "รอโอน") for this team
      console.log('Querying pending transactions for team:', teamId);
      const pendingTransactionsQuery = query(
        collection(db, 'transactions'),
        where('teamId', '==', teamId),
        where('status', '==', 'รอโอน')
      );
      
      const pendingTransactionsSnapshot = await getDocs(pendingTransactionsQuery);
      console.log('Pending transactions query result:', pendingTransactionsSnapshot.size, 'transactions found');
      
      // Format transaction data
      const pendingTransactions = pendingTransactionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          transactionId: data.transactionId || '',
          customerUsername: data.customerUsername || '',
          websiteName: data.websiteName || '',
          websiteId: data.websiteId || '',
          bankName: data.bankName || '',
          accountNumber: data.accountNumber || '',
          realName: data.realName || '',
          amount: data.amount || 0,
          balanceBefore: data.balanceBefore || 0,
          balanceAfter: data.balanceAfter || 0,
          status: data.status || '',
          type: data.type || '',
          note: data.note || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
          createdBy: data.createdBy || '',
          lastModifiedBy: data.lastModifiedBy || null,
          lastModifiedByEmail: data.lastModifiedByEmail || null,
          lastModifiedAt: data.lastModifiedAt?.toDate?.()?.toISOString() || null
        };
      });

      // Sort by creation date (newest first)
      pendingTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      });

      console.log('Returning response with', pendingTransactions.length, 'pending transactions');
      
      return NextResponse.json({
        success: true,
        teamId: teamId,
        teamName: teamName,
        pendingTransactionCount: pendingTransactions.length,
        transactions: pendingTransactions
      });

    } catch (dbError) {
      console.error('Database query error:', dbError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Database connection failed',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error',
          note: 'The API requires Firebase security rules to allow read access, or proper authentication setup'
        },
        { status: 503 }
      );
    }

  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 