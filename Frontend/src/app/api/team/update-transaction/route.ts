import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, serverTimestamp, runTransaction, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  let requestData: any = {};
  
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

    // Parse request body
    requestData = await request.json();

    // Validate required fields
    if (!requestData.id) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Transaction document ID is required' 
        },
        { status: 400 }
      );
    }

    if (!requestData.status || !['สำเร็จ', 'ล้มเหลว', 'ยกเลิก'].includes(requestData.status)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Status must be either "สำเร็จ", "ล้มเหลว" or "ยกเลิก"' 
        },
        { status: 400 }
      );
    }

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

      // Use Firestore transaction for atomic operations
      const result = await runTransaction(db, async (transaction) => {
        // Get transaction document
        const transactionDocRef = doc(db, 'transactions', requestData.id);
        const transactionDoc = await transaction.get(transactionDocRef);
        
        if (!transactionDoc.exists()) {
          throw new Error('Transaction not found');
        }

        const transactionData = transactionDoc.data() as any;
        
        // Check if transaction belongs to the authenticated team
        if (transactionData.teamId !== teamId) {
          throw new Error('Transaction not found in your team');
        }

        // Check if transaction is in a state that can be updated
        if (!['กำลังโอน', 'รอโอน'].includes(transactionData.status)) {
          throw new Error(`Transaction cannot be updated. Current status: ${transactionData.status}`);
        }

        // Check if transaction is already completed (idempotency check)
        if (["สำเร็จ", "ล้มเหลว", "ยกเลิก"].includes(transactionData.status)) {
          return {
            alreadyCompleted: true,
            transactionData: transactionData,
            websiteName: '',
            currentWebsiteBalance: 0,
            refundAmount: 0,
            websiteUpdated: false
          };
        }

        // Handle credit refund for failed or cancelled transactions
        let websiteUpdated = false;
        let refundAmount = 0;
        let websiteName = '';
        let currentWebsiteBalance = 0;
        
        if ((requestData.status === 'ล้มเหลว' || requestData.status === 'ยกเลิก') && transactionData.type === 'withdraw') {
          if (transactionData.websiteId && transactionData.amount) {
            // Validate that the money was actually deducted
            if (transactionData.balanceBefore !== undefined && 
                transactionData.balanceAfter !== undefined && 
                transactionData.balanceBefore >= transactionData.balanceAfter) {
              
              const expectedDeduction = transactionData.balanceBefore - transactionData.balanceAfter;
              
              if (expectedDeduction === transactionData.amount) {
                // Get website document within transaction
                const websiteDocRef = doc(db, 'websites', transactionData.websiteId);
                const websiteDoc = await transaction.get(websiteDocRef);
                
                if (websiteDoc.exists()) {
                  const websiteData = websiteDoc.data() as any;
                  const currentBalance = websiteData.balance || 0;
                  refundAmount = transactionData.amount;
                  const newBalance = currentBalance + refundAmount;
                  websiteName = websiteData.name || 'Unknown Website';
                  currentWebsiteBalance = newBalance;
                  
                  // Update website balance
                  transaction.update(websiteDocRef, {
                    balance: newBalance,
                    updatedAt: serverTimestamp()
                  });
                  
                  websiteUpdated = true;
                } else {
                  throw new Error('Website not found for refund');
                }
              } else {
                throw new Error(`Refund validation failed. Expected deduction: ${expectedDeduction}, Actual: ${transactionData.amount}`);
              }
            } else {
              throw new Error('Invalid transaction data for refund. Missing balance information.');
            }
          } else {
            throw new Error('Missing website ID or amount for refund');
          }
        } else {
          // For non-refund cases, get current website balance for display
          if (transactionData.websiteId) {
            try {
              const websiteDocRef = doc(db, 'websites', transactionData.websiteId);
              const websiteDoc = await transaction.get(websiteDocRef);
              
              if (websiteDoc.exists()) {
                const websiteData = websiteDoc.data() as any;
                currentWebsiteBalance = websiteData.balance || 0;
                websiteName = websiteData.name || 'Unknown Website';
              }
            } catch (balanceError) {
              // Continue without balance info - silent fail
            }
          }
        }

        // Update transaction status
        const updateData: any = {
          status: requestData.status,
          updatedAt: serverTimestamp()
        };

        // Add note if provided
        if (requestData.note) {
          updateData.note = requestData.note;
        }

        // Add completion timestamp for successful transactions
        if (requestData.status === 'สำเร็จ') {
          updateData.completedAt = serverTimestamp();
        } else if (requestData.status === 'ล้มเหลว') {
          updateData.failedAt = serverTimestamp();
          if (websiteUpdated) {
            updateData.refundedAt = serverTimestamp();
            updateData.refundAmount = refundAmount;
          }
        } else if (requestData.status === 'ยกเลิก') {
          updateData.cancelledAt = serverTimestamp();
          if (websiteUpdated) {
            updateData.refundedAt = serverTimestamp();
            updateData.refundAmount = refundAmount;
          }
        }

        transaction.update(transactionDocRef, updateData);

        return {
          alreadyCompleted: false,
          transactionData: transactionData,
          websiteName: websiteName,
          currentWebsiteBalance: currentWebsiteBalance,
          refundAmount: refundAmount,
          websiteUpdated: websiteUpdated
        };
      });

      // Handle idempotent response for already completed transactions
      if (result.alreadyCompleted) {
        return NextResponse.json({
          success: true,
          message: `Transaction already completed with status "${result.transactionData.status}" (idempotent response)`,
          teamId: teamId,
          teamName: teamName,
          id: requestData.id,
          transactionId: result.transactionData.transactionId || '',
          oldStatus: result.transactionData.status,
          newStatus: result.transactionData.status,
          website: {
            id: result.transactionData.websiteId || '',
            name: result.websiteName || 'Unknown Website',
            currentBalance: result.currentWebsiteBalance
          },
          idempotent: true
        });
      }

      // Prepare response
      const response: any = {
        success: true,
        teamId: teamId,
        teamName: teamName,
        id: requestData.id,
        transactionId: result.transactionData.transactionId || '',
        oldStatus: result.transactionData.status,
        newStatus: requestData.status,
        message: `Transaction status updated to "${requestData.status}"`,
        website: {
          id: result.transactionData.websiteId || '',
          name: result.websiteName || 'Unknown Website',
          currentBalance: result.currentWebsiteBalance
        }
      };

      // Add refund information if applicable
      if (result.websiteUpdated) {
        response.creditRefund = {
          websiteId: result.transactionData.websiteId,
          websiteName: result.websiteName,
          refundAmount: result.refundAmount,
          message: `Credit refunded: ${result.refundAmount} THB`,
          balanceAfterRefund: result.currentWebsiteBalance
        };
      }
      
      return NextResponse.json(response);

    } catch (dbError) {
      console.error('Database error:', dbError);
      
      // Create enhanced error audit log with detailed transaction information
      try {
        // Get transaction details for audit log if possible
        let transactionDetails = {};
        try {
          const transactionDocRef = doc(db, 'transactions', requestData.id);
          const transactionDoc = await getDoc(transactionDocRef);
          
          if (transactionDoc.exists()) {
            const transactionData = transactionDoc.data() as any;
            transactionDetails = {
              originalTransactionId: transactionData.transactionId || '',
              customerUsername: transactionData.customerUsername || '',
              websiteId: transactionData.websiteId || '',
              websiteName: transactionData.websiteName || '',
              bankName: transactionData.bankName || '',
              accountNumber: transactionData.accountNumber || '',
              realName: transactionData.realName || '',
              amount: transactionData.amount || 0,
              currentStatus: transactionData.status || '',
              balanceBefore: transactionData.balanceBefore || 0,
              balanceAfter: transactionData.balanceAfter || 0,
              createdAt: transactionData.createdAt || null,
              type: transactionData.type || '',
              teamId: transactionData.teamId || '',
              teamName: transactionData.teamName || ''
            };
          }
        } catch (detailsError) {
          console.error('Failed to get transaction details for audit log:', detailsError);
        }

        await addDoc(collection(db, 'audit_logs'), {
          action: 'transaction_status_update_failed',
          apiEndpoint: '/api/team/update-transaction',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          errorType: dbError instanceof Error ? dbError.name : 'UnknownError',
          transactionId: requestData.id,
          requestedStatus: requestData.status,
          requestedNote: requestData.note || null,
          
          // Enhanced transaction details
          transactionDetails: transactionDetails,
          
          // Request metadata
          requestBody: {
            id: requestData.id,
            status: requestData.status,
            note: requestData.note || null
          },
          
          // System metadata
          timestamp: serverTimestamp(),
          success: false,
          userAgent: request.headers.get('User-Agent') || 'Unknown',
          ip: request.headers.get('X-Forwarded-For') || 'Unknown',
          referer: request.headers.get('Referer') || 'Unknown',
          
          // Additional debugging info
          stackTrace: dbError instanceof Error ? dbError.stack : null
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
    
    // Create enhanced error audit log for server errors
    try {
      // Get transaction details for audit log if possible
      let transactionDetails = {};
      if (requestData?.id) {
        try {
          const transactionDocRef = doc(db, 'transactions', requestData.id);
          const transactionDoc = await getDoc(transactionDocRef);
          
          if (transactionDoc.exists()) {
            const transactionData = transactionDoc.data() as any;
            transactionDetails = {
              originalTransactionId: transactionData.transactionId || '',
              customerUsername: transactionData.customerUsername || '',
              websiteId: transactionData.websiteId || '',
              websiteName: transactionData.websiteName || '',
              bankName: transactionData.bankName || '',
              accountNumber: transactionData.accountNumber || '',
              realName: transactionData.realName || '',
              amount: transactionData.amount || 0,
              currentStatus: transactionData.status || '',
              balanceBefore: transactionData.balanceBefore || 0,
              balanceAfter: transactionData.balanceAfter || 0,
              createdAt: transactionData.createdAt || null,
              type: transactionData.type || '',
              teamId: transactionData.teamId || '',
              teamName: transactionData.teamName || ''
            };
          }
        } catch (detailsError) {
          console.error('Failed to get transaction details for audit log:', detailsError);
        }
      }

      await addDoc(collection(db, 'audit_logs'), {
        action: 'transaction_status_update_server_error',
        apiEndpoint: '/api/team/update-transaction',
        error: error instanceof Error ? error.message : 'Unknown server error',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        transactionId: requestData?.id || 'Unknown',
        requestedStatus: requestData?.status || 'Unknown',
        requestedNote: requestData?.note || null,
        
        // Enhanced transaction details
        transactionDetails: transactionDetails,
        
        // Request metadata
        requestBody: requestData || {},
        
        // System metadata
        timestamp: serverTimestamp(),
        success: false,
        userAgent: request.headers.get('User-Agent') || 'Unknown',
        ip: request.headers.get('X-Forwarded-For') || 'Unknown',
        referer: request.headers.get('Referer') || 'Unknown',
        
        // Additional debugging info
        stackTrace: error instanceof Error ? error.stack : null
      });
    } catch (auditError) {
      console.error('Failed to create server error audit log:', auditError);
    }
    
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