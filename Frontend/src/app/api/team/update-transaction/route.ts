import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    console.log('API called: /api/team/update-transaction');
    
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

    // Parse request body
    const requestData = await request.json();
    console.log('Request data:', requestData);

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

    if (!requestData.status || !['สำเร็จ', 'ล้มเหลว'].includes(requestData.status)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Status must be either "สำเร็จ" or "ล้มเหลว"' 
        },
        { status: 400 }
      );
    }

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
      console.log('Found team:', teamId, 'name:', teamName);

      // Find transaction by document ID
      console.log('Finding transaction with document ID:', requestData.id);
      
      try {
        const transactionDocRef = doc(db, 'transactions', requestData.id);
        const transactionDoc = await getDoc(transactionDocRef);
        
        if (!transactionDoc.exists()) {
          console.log('No transaction found with document ID:', requestData.id);
          return NextResponse.json(
            { 
              success: false,
              error: 'Transaction not found' 
            },
            { status: 404 }
          );
        }

        const transactionData = transactionDoc.data();
        
        // Check if transaction belongs to the authenticated team
        if (transactionData.teamId !== teamId) {
          console.log('Transaction does not belong to team:', { transactionTeam: transactionData.teamId, authTeam: teamId });
          return NextResponse.json(
            { 
              success: false,
              error: 'Transaction not found in your team' 
            },
            { status: 404 }
          );
        }
      } catch (docError) {
        console.error('Error getting transaction document:', docError);
        return NextResponse.json(
          { 
            success: false,
            error: 'Failed to retrieve transaction',
            details: docError instanceof Error ? docError.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
      
      // Get transaction data (we know it exists from the try block above)
      const transactionDocRef = doc(db, 'transactions', requestData.id);
      const transactionDoc = await getDoc(transactionDocRef);
      const transactionData = transactionDoc.data()!;
      
      // Check if transaction is in a state that can be updated
      if (!['กำลังโอน', 'รอโอน'].includes(transactionData.status)) {
        console.log('Transaction cannot be updated, current status:', transactionData.status);
        return NextResponse.json(
          { 
            success: false,
            error: `Transaction cannot be updated. Current status: ${transactionData.status}` 
          },
          { status: 400 }
        );
      }

      // Handle credit refund for failed transactions
      let websiteUpdated = false;
      let refundAmount = 0;
      let websiteName = '';
      let currentWebsiteBalance = 0;
      
      if (requestData.status === 'ล้มเหลว' && transactionData.type === 'withdraw') {
        console.log('Processing credit refund for failed withdrawal...');
        
        if (transactionData.websiteId && transactionData.amount) {
          try {
            // Get website document
            const websiteDocRef = doc(db, 'websites', transactionData.websiteId);
            const websiteDoc = await getDoc(websiteDocRef);
            
            if (websiteDoc.exists()) {
              const websiteData = websiteDoc.data();
              const currentBalance = websiteData.balance || 0;
              refundAmount = transactionData.amount;
              const newBalance = currentBalance + refundAmount;
              websiteName = websiteData.name || 'Unknown Website';
              currentWebsiteBalance = newBalance; // Store the new balance after refund
              
              console.log('Refunding credit:', {
                websiteId: transactionData.websiteId,
                websiteName: websiteName,
                currentBalance: currentBalance,
                refundAmount: refundAmount,
                newBalance: newBalance
              });
              
              // Update website balance
              await updateDoc(websiteDocRef, {
                balance: newBalance,
                updatedAt: serverTimestamp()
              });
              
              websiteUpdated = true;
              console.log('Credit refunded successfully');
            } else {
              console.log('Website not found for refund:', transactionData.websiteId);
            }
          } catch (refundError) {
            console.error('Error processing credit refund:', refundError);
            return NextResponse.json(
              { 
                success: false,
                error: 'Failed to process credit refund',
                details: refundError instanceof Error ? refundError.message : 'Unknown refund error'
              },
              { status: 500 }
            );
          }
        }
      } else {
        // For non-refund cases, get current website balance for display
        if (transactionData.websiteId) {
          try {
            const websiteDocRef = doc(db, 'websites', transactionData.websiteId);
            const websiteDoc = await getDoc(websiteDocRef);
            
            if (websiteDoc.exists()) {
              const websiteData = websiteDoc.data();
              currentWebsiteBalance = websiteData.balance || 0;
              websiteName = websiteData.name || 'Unknown Website';
            }
          } catch (balanceError) {
            console.error('Error getting website balance:', balanceError);
            // Continue without balance info
          }
        }
      }

      // Update transaction status
      console.log('Updating transaction status to:', requestData.status);
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
      }

      await updateDoc(doc(db, 'transactions', requestData.id), updateData);

      // Prepare response
      const response: any = {
        success: true,
        teamId: teamId,
        teamName: teamName,
        id: requestData.id,
        transactionId: transactionData.transactionId || '',
        oldStatus: transactionData.status,
        newStatus: requestData.status,
        message: `Transaction status updated to "${requestData.status}"`,
        website: {
          id: transactionData.websiteId || '',
          name: websiteName || 'Unknown Website',
          currentBalance: currentWebsiteBalance
        }
      };

      // Add refund information if applicable
      if (websiteUpdated) {
        response.creditRefund = {
          websiteId: transactionData.websiteId,
          websiteName: websiteName,
          refundAmount: refundAmount,
          message: `Credit refunded: ${refundAmount} THB`
        };
      }

      console.log('Transaction updated successfully:', response);
      
      return NextResponse.json(response);

    } catch (dbError) {
      console.error('Database query error:', dbError);
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
    console.error('Error updating transaction:', error);
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