import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, limit, updateDoc, doc, serverTimestamp, addDoc, runTransaction } from 'firebase/firestore';
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
      const teamData = teamDoc.data() as any;
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
          const data = doc.data() as any;
          const status = data.status;
          return status === 'รอโอน';
        })
        .map(doc => ({
          doc: doc,
          data: doc.data() as any,
          createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt)
        }));
      
      // Create audit log for request
      await addDoc(collection(db, 'audit_logs'), {
        action: 'pending_transactions_request',
        apiEndpoint: '/api/team/pending-transactions',
        teamId: teamId,
        teamName: teamName,
        pendingCount: pendingTransactions.length,
        timestamp: serverTimestamp(),
        success: true,
        userAgent: request.headers.get('User-Agent') || 'Unknown',
        ip: request.headers.get('X-Forwarded-For') || 'Unknown'
      });

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
              const websiteData = websiteDoc.data() as any;
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
                const websiteData = websiteSnapshot.docs[0].data() as any;
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

      // Use atomic transaction to update status safely
      const updateResult = await runTransaction(db, async (transaction) => {
        // Re-read the transaction document to ensure it's still pending
        const transactionDocRef = doc(db, 'transactions', transactionDoc.id);
        const currentTransactionDoc = await transaction.get(transactionDocRef);
        
        if (!currentTransactionDoc.exists()) {
          throw new Error('Transaction document no longer exists');
        }
        
        const currentTransactionData = currentTransactionDoc.data() as any;
        
        // Double-check that it's still pending (prevent race conditions)
        if (currentTransactionData.status !== 'รอโอน') {
          throw new Error(`Transaction status changed to "${currentTransactionData.status}". Cannot update.`);
        }
        
        // Update status to "กำลังโอน"
        transaction.update(transactionDocRef, {
          status: 'กำลังโอน',
          updatedAt: serverTimestamp(),
          processingStartedAt: serverTimestamp()
        });

        // Create audit log for status update
        const auditLogData = {
          action: 'transaction_status_change',
          apiEndpoint: '/api/team/pending-transactions',
          teamId: teamId,
          teamName: teamName,
          transactionId: transactionDoc.id,
          originalTransactionId: transactionData.transactionId,
          customerUsername: transactionData.customerUsername,
          websiteId: transactionData.websiteId,
          websiteName: transactionData.websiteName,
          amount: transactionData.amount,
          oldStatus: 'รอโอน',
          newStatus: 'กำลังโอน',
          timestamp: serverTimestamp(),
          success: true,
          userAgent: request.headers.get('User-Agent') || 'Unknown',
          ip: request.headers.get('X-Forwarded-For') || 'Unknown'
        };

        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, auditLogData);

        return currentTransactionData;
      });

      // Format transaction data with updated status
      const transaction = {
        id: transactionDoc.id,
        transactionId: updateResult.transactionId || '',
        customerUsername: updateResult.customerUsername || '',
        websiteName: updateResult.websiteName || '',
        websiteId: updateResult.websiteId || '',
        bankName: updateResult.bankName || '',
        accountNumber: updateResult.accountNumber || '',
        realName: updateResult.realName || '',
        amount: updateResult.amount || 0,
        balanceBefore: updateResult.balanceBefore || 0,
        balanceAfter: updateResult.balanceAfter || 0,
        status: 'กำลังโอน', // Updated status
        type: updateResult.type || '',
        note: updateResult.note || null,
        createdAt: updateResult.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: new Date().toISOString(), // Current timestamp
        processingStartedAt: new Date().toISOString(),
        createdBy: updateResult.createdBy || '',
        lastModifiedBy: updateResult.lastModifiedBy || null,
        lastModifiedByEmail: updateResult.lastModifiedByEmail || null,
        lastModifiedAt: updateResult.lastModifiedAt?.toDate?.()?.toISOString() || null
      };
      
      return NextResponse.json({
        success: true,
        teamId: teamId,
        teamName: teamName,
        url: websiteUrl,
        apiKey: websiteApiKey,
        message: 'Transaction retrieved and status updated to "กำลังโอน"',
        transaction: transaction,
        totalPendingBefore: pendingTransactions.length,
        totalPendingAfter: pendingTransactions.length - 1
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      
      // Create error audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          action: 'pending_transactions_request_failed',
          apiEndpoint: '/api/team/pending-transactions',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          timestamp: serverTimestamp(),
          success: false,
          userAgent: request.headers.get('User-Agent') || 'Unknown',
          ip: request.headers.get('X-Forwarded-For') || 'Unknown'
        });
      } catch (auditError) {
        console.error('Failed to create error audit log:', auditError);
      }

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