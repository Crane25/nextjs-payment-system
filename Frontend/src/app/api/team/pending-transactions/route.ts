import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, limit, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  try {
    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing or invalid Authorization header. Use: Bearer <team_api_key>' 
        },
        { status: 401 }
      );
    }

    const providedApiKey = authHeader.replace('Bearer ', '');

    try {
      // Find team by API key
      const teamsQuery = query(
        collection(db, 'teams'),
        where('apiKey', '==', providedApiKey)
      );
      
      const teamsSnapshot = await getDocs(teamsQuery);
      
      if (teamsSnapshot.empty) {
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
      const teamData = teamDoc.data();
      const teamName = teamData.name;
      const teamUrl = teamData.url || '';
      const teamApiKey = teamData.apiKey || '';
      
      // Get transactions for this team
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('teamId', '==', teamId)
      );
      
      const transactionsSnapshot = await getDocs(transactionsQuery);
      
      // Filter for pending transactions on client side
      const pendingTransactions = transactionsSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          const status = data.status;
          return status === 'รอโอน';
        })
        .map(doc => ({
          doc: doc,
          data: doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt)
        }));
      
      if (pendingTransactions.length === 0) {
        return NextResponse.json({
          success: true,
          teamId: teamId,
          teamName: teamName,
          message: 'No pending transactions found',
          transaction: null
        });
      }

      // Sort by creation date (oldest first for FIFO)
      pendingTransactions.sort((a, b) => {
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      // Get the first (oldest) pending transaction
      const transactionDoc = pendingTransactions[0].doc;
      const transactionData = pendingTransactions[0].data;
      
      // Get website data for URL and API Key
      let websiteUrl = '';
      let websiteApiKey = '';
      
      if (transactionData.websiteId) {
        try {
          // Method 1: Try to get website by document ID (most common case)
          try {
            const websiteDocRef = doc(db, 'websites', transactionData.websiteId);
            const websiteDoc = await getDoc(websiteDocRef);
            
            if (websiteDoc.exists()) {
              const websiteData = websiteDoc.data();
              websiteUrl = websiteData.url || '';
              websiteApiKey = websiteData.apiKey || '';
            } else {
              // Method 2: Fallback - search by websiteId field (legacy support)
              const websiteQuery = query(
                collection(db, 'websites'),
                where('websiteId', '==', transactionData.websiteId)
              );
              
              const websiteSnapshot = await getDocs(websiteQuery);
              if (!websiteSnapshot.empty) {
                const websiteData = websiteSnapshot.docs[0].data();
                websiteUrl = websiteData.url || '';
                websiteApiKey = websiteData.apiKey || '';
              }
            }
          } catch (docError) {
            console.error('Error getting website document:', docError);
          }
        } catch (websiteError) {
          console.error('Error fetching website data:', websiteError);
        }
      }

      // Update status to "กำลังโอน"
      await updateDoc(doc(db, 'transactions', transactionDoc.id), {
        status: 'กำลังโอน',
        updatedAt: serverTimestamp()
      });

      // Format transaction data with updated status
      const transaction = {
        id: transactionDoc.id,
        transactionId: transactionData.transactionId || '',
        customerUsername: transactionData.customerUsername || '',
        websiteName: transactionData.websiteName || '',
        websiteId: transactionData.websiteId || '',
        bankName: transactionData.bankName || '',
        accountNumber: transactionData.accountNumber || '',
        realName: transactionData.realName || '',
        amount: transactionData.amount || 0,
        balanceBefore: transactionData.balanceBefore || 0,
        balanceAfter: transactionData.balanceAfter || 0,
        status: 'กำลังโอน', // Updated status
        type: transactionData.type || '',
        note: transactionData.note || null,
        createdAt: transactionData.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: new Date().toISOString(), // Current timestamp
        createdBy: transactionData.createdBy || '',
        lastModifiedBy: transactionData.lastModifiedBy || null,
        lastModifiedByEmail: transactionData.lastModifiedByEmail || null,
        lastModifiedAt: transactionData.lastModifiedAt?.toDate?.()?.toISOString() || null
      };
      
      return NextResponse.json({
        success: true,
        teamId: teamId,
        teamName: teamName,
        url: websiteUrl,
        apiKey: websiteApiKey,
        message: 'Transaction retrieved and status updated to "กำลังโอน"',
        transaction: transaction
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Database connection failed',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        },
        { status: 503 }
      );
    }

  } catch (error) {
    console.error('Server error:', error);
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