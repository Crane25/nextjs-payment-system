import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, limit, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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

    const providedApiKey = authHeader.replace('Bearer ', '');
    console.log('Team API key:', providedApiKey);

    try {
      // Find team by API key
      console.log('Querying teams collection...');
      const teamsQuery = query(
        collection(db, 'teams'),
        where('apiKey', '==', providedApiKey)
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
      const teamData = teamDoc.data();
      const teamName = teamData.name;
      const teamUrl = teamData.url || '';
      const teamApiKey = teamData.apiKey || '';
      console.log('Found team:', teamId, 'name:', teamName, 'url:', teamUrl);
      
      // Get transactions for this team (using same pattern as working APIs)
      console.log('Querying transactions for team:', teamId);
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('teamId', '==', teamId)
      );
      
      const transactionsSnapshot = await getDocs(transactionsQuery);
      console.log('Transactions query result:', transactionsSnapshot.size, 'transactions found');
      
      // Filter for pending transactions on client side (same as websites API pattern)
      const pendingTransactions = transactionsSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          const status = data.status;
          console.log('Checking transaction:', data.transactionId, 'status:', status);
          return status === 'รอโอน';
        })
        .map(doc => ({
          doc: doc,
          data: doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt)
        }));

      console.log('Pending transactions found:', pendingTransactions.length);
      
      if (pendingTransactions.length === 0) {
        console.log('No pending transactions found');
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
          console.log('Fetching website data for websiteId:', transactionData.websiteId);
          
          // Method 1: Try to get website by document ID (most common case)
          try {
            const websiteDocRef = doc(db, 'websites', transactionData.websiteId);
            const websiteDoc = await getDoc(websiteDocRef);
            
            if (websiteDoc.exists()) {
              const websiteData = websiteDoc.data();
              websiteUrl = websiteData.url || '';
              websiteApiKey = websiteData.apiKey || '';
              console.log('Found website by document ID - URL:', websiteUrl, 'API Key:', websiteApiKey ? 'Present' : 'Missing');
            } else {
              console.log('Website document not found by ID:', transactionData.websiteId);
              
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
                console.log('Found website by websiteId field - URL:', websiteUrl, 'API Key:', websiteApiKey ? 'Present' : 'Missing');
              } else {
                console.log('No website found with websiteId field:', transactionData.websiteId);
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
      console.log('Updating transaction status to "กำลังโอน" for transaction:', transactionDoc.id);
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

      console.log('Returning transaction with updated status:', transaction.transactionId);
      
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