import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface TransactionRequest {
  transactionId: string;
  customerUsername: string;
  websiteName?: string; // Optional - ใช้แทน websiteId ได้
  websiteId?: string; // Optional - ใช้แทน websiteName ได้
  bankName: string;
  accountNumber: string;
  realName: string;
  amount: number;
}

export async function POST(request: NextRequest) {
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

    const teamApiKey = authHeader.replace('Bearer ', '');

    // Parse request body
    let requestData: TransactionRequest;
    try {
      requestData = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid JSON in request body' 
        },
        { status: 400 }
      );
    }

    // Check if either websiteName or websiteId is provided
    if (!requestData.websiteName && !requestData.websiteId) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Either websiteName or websiteId is required'
        },
        { status: 400 }
      );
    }

    // Validate required fields
    const requiredFields = [
      'transactionId',
      'customerUsername', 
      'bankName',
      'accountNumber',
      'realName',
      'amount'
    ];

    const missingFields = requiredFields.filter(field => 
      !requestData[field as keyof TransactionRequest] && 
      requestData[field as keyof TransactionRequest] !== 0
    );

    if (missingFields.length > 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields', 
          missingFields: missingFields,
          required: requiredFields
        },
        { status: 400 }
      );
    }

    // Validate amount is a positive number
    if (typeof requestData.amount !== 'number' || requestData.amount <= 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Amount must be a positive number' 
        },
        { status: 400 }
      );
    }

    try {
      // Find team by API key
      const teamsQuery = query(
        collection(db, 'teams'),
        where('apiKey', '==', teamApiKey)
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
      const apiTeamId = teamDoc.id;
      const teamName = teamDoc.data().name;

      // Create idempotency key to prevent duplicate transactions
      const idempotencyKey = `${apiTeamId}-${requestData.customerUsername}-${requestData.transactionId}`;

      // Check for existing transaction with same idempotency key
      const existingTransactionQuery = query(
        collection(db, 'transactions'),
        where('idempotencyKey', '==', idempotencyKey)
      );
      
      const existingTransactionSnapshot = await getDocs(existingTransactionQuery);
      
      if (!existingTransactionSnapshot.empty) {
        const existingTransaction = existingTransactionSnapshot.docs[0];
        const existingData = existingTransaction.data();
        
        return NextResponse.json(
          { 
            success: true,
            message: 'Transaction already exists (idempotent response)',
            data: {
              id: existingTransaction.id,
              transactionId: existingData.transactionId,
              customerUsername: existingData.customerUsername,
              websiteName: existingData.websiteName,
              websiteId: existingData.websiteId,
              bankName: existingData.bankName,
              accountNumber: existingData.accountNumber,
              realName: existingData.realName,
              amount: existingData.amount,
              balanceBefore: existingData.balanceBefore,
              balanceAfter: existingData.balanceAfter,
              status: existingData.status,
              type: existingData.type,
              teamId: existingData.teamId,
              teamName: existingData.teamName,
              createdAt: existingData.createdAt?.toDate?.()?.toISOString() || existingData.createdAt
            },
            idempotent: true
          },
          { status: 200 }
        );
      }

      // Use Firestore Transaction for atomic operations
      const result = await runTransaction(db, async (transaction) => {
        let websiteId: string;
        let websiteName: string;
        let websiteRef: any;

        // Find website first
        if (requestData.websiteId) {
          // Use websiteId directly
          websiteId = requestData.websiteId;
          websiteRef = doc(db, 'websites', websiteId);
          
          const websiteDoc = await transaction.get(websiteRef);
          
          if (!websiteDoc.exists()) {
            throw new Error('Website not found');
          }

          const websiteData = websiteDoc.data() as any;
          
          // Check if website belongs to the authenticated team
          if (websiteData.teamId !== apiTeamId) {
            throw new Error('Website not found in your team');
          }

          websiteName = websiteData.name || 'Unknown Website';

        } else {
          // Use websiteName (legacy method) - need to find the document first
          const websitesQuery = query(
            collection(db, 'websites'),
            where('name', '==', requestData.websiteName),
            where('teamId', '==', apiTeamId)
          );
          
          const websitesSnapshot = await getDocs(websitesQuery);
          
          if (websitesSnapshot.empty) {
            throw new Error('Website not found in your team');
          }

          const websiteDoc = websitesSnapshot.docs[0];
          websiteId = websiteDoc.id;
          websiteName = requestData.websiteName!;
          websiteRef = doc(db, 'websites', websiteId);
          
          // Re-read within transaction
          const websiteTransactionDoc = await transaction.get(websiteRef);
          if (!websiteTransactionDoc.exists()) {
            throw new Error('Website not found in transaction');
          }
        }

        // Get current balance within transaction
        const websiteDoc = await transaction.get(websiteRef);
        if (!websiteDoc.exists()) {
          throw new Error('Website document not found');
        }
        
        const websiteData = websiteDoc.data() as any;
        const currentBalance = websiteData.balance || 0;

        // Check if website has sufficient balance
        if (currentBalance < requestData.amount) {
          throw new Error(`Insufficient balance. Current: ${currentBalance}, Requested: ${requestData.amount}`);
        }

        // Calculate new balance after withdrawal
        const newBalance = currentBalance - requestData.amount;

        // Create transaction document data
        const transactionData = {
          idempotencyKey: idempotencyKey,
          transactionId: requestData.transactionId,
          customerUsername: requestData.customerUsername,
          websiteName: websiteName,
          websiteId: websiteId,
          bankName: requestData.bankName,
          accountNumber: requestData.accountNumber,
          realName: requestData.realName,
          amount: requestData.amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          status: 'รอโอน',
          type: 'withdraw',
          teamId: apiTeamId,
          teamName: teamName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'api'
        };

        // Update website balance
        transaction.update(websiteRef, {
          balance: newBalance,
          updatedAt: serverTimestamp()
        });

        // Create transaction document
        const transactionRef = doc(collection(db, 'transactions'));
        transaction.set(transactionRef, transactionData);

        // Create audit log
        const auditLogData = {
          action: 'withdraw_request',
          apiEndpoint: '/api/team/transactions',
          teamId: apiTeamId,
          teamName: teamName,
          websiteId: websiteId,
          websiteName: websiteName,
          transactionId: requestData.transactionId,
          customerUsername: requestData.customerUsername,
          amount: requestData.amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          idempotencyKey: idempotencyKey,
          timestamp: serverTimestamp(),
          success: true,
          userAgent: request.headers.get('User-Agent') || 'Unknown',
          ip: request.headers.get('X-Forwarded-For') || 'Unknown'
        };

        const auditRef = doc(collection(db, 'audit_logs'));
        transaction.set(auditRef, auditLogData);

        return {
          transactionId: transactionRef.id,
          transactionData: {
            ...transactionData,
            createdAt: new Date().toISOString() // For response
          }
        };
      });

      return NextResponse.json({
        success: true,
        message: 'Withdrawal transaction created successfully',
        data: {
          id: result.transactionId,
          transactionId: requestData.transactionId,
          customerUsername: requestData.customerUsername,
          websiteName: result.transactionData.websiteName,
          websiteId: result.transactionData.websiteId,
          bankName: requestData.bankName,
          accountNumber: requestData.accountNumber,
          realName: requestData.realName,
          amount: requestData.amount,
          balanceBefore: result.transactionData.balanceBefore,
          balanceAfter: result.transactionData.balanceAfter,
          status: 'รอโอน',
          type: 'withdraw',
          teamId: apiTeamId,
          teamName: teamName,
          createdAt: result.transactionData.createdAt,
          idempotencyKey: idempotencyKey
        }
      }, { status: 201 });

    } catch (dbError) {
      console.error('Database error:', dbError);
      
      // Create error audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          action: 'withdraw_request_failed',
          apiEndpoint: '/api/team/transactions',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          transactionId: requestData.transactionId,
          customerUsername: requestData.customerUsername,
          amount: requestData.amount,
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
          error: 'Database operation failed',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        },
        { status: 503 }
      );
    }

  } catch (error) {
    console.error('Error creating transaction:', error);
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

// GET method to retrieve transactions for a team
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

      // Get transactions for this team
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('teamId', '==', teamId)
      );
      
      const transactionsSnapshot = await getDocs(transactionsQuery);
      
      const transactions = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null
      }));

      return NextResponse.json({
        success: true,
        teamId: teamId,
        teamName: teamName,
        transactionCount: transactions.length,
        transactions: transactions
      });

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
    console.error('Error fetching transactions:', error);
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