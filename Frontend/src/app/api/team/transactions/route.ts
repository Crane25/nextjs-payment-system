import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, getDoc } from 'firebase/firestore';
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
    console.log('API called: /api/team/transactions');
    
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

    // Parse request body
    let requestData: TransactionRequest;
    try {
      requestData = await request.json();
      console.log('Request data:', requestData);
    } catch (parseError) {
      console.log('Invalid JSON in request body');
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
      console.log('Missing required fields:', missingFields);
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
      console.log('Invalid amount:', requestData.amount);
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
      const apiTeamId = teamDoc.id;
      const teamName = teamDoc.data().name;
      console.log('Found team:', apiTeamId, 'name:', teamName);

      // Check if combination of customerUsername + transactionId already exists
      console.log('Checking for duplicate customerUsername + transactionId combination...');
      const existingTransactionQuery = query(
        collection(db, 'transactions'),
        where('customerUsername', '==', requestData.customerUsername),
        where('transactionId', '==', requestData.transactionId)
      );
      
      const existingTransactionSnapshot = await getDocs(existingTransactionQuery);
      
      if (!existingTransactionSnapshot.empty) {
        console.log('Transaction with same customerUsername and transactionId already exists:', {
          customerUsername: requestData.customerUsername,
          transactionId: requestData.transactionId
        });
        return NextResponse.json(
          { 
            success: false,
            error: 'Transaction with this customerUsername and transactionId combination already exists.' 
          },
          { status: 409 }
        );
      }

      // Find the website to check balance and deduct amount
      let websiteId: string;
      let websiteName: string;
      let currentBalance: number;

      if (requestData.websiteId) {
        // Use websiteId directly
        console.log('Using websiteId:', requestData.websiteId);
        websiteId = requestData.websiteId;
        
        // Get website document by ID
        const websiteDocRef = doc(db, 'websites', websiteId);
        const websiteDoc = await getDoc(websiteDocRef);
        
        if (!websiteDoc.exists()) {
          console.log('Website not found by ID:', websiteId);
          return NextResponse.json(
            { 
              success: false,
              error: 'Website not found' 
            },
            { status: 404 }
          );
        }

        const websiteData = websiteDoc.data();
        
        // Check if website belongs to the authenticated team
        if (websiteData.teamId !== apiTeamId) {
          console.log('Website does not belong to team:', { websiteTeam: websiteData.teamId, authTeam: apiTeamId });
          return NextResponse.json(
            { 
              success: false,
              error: 'Website not found in your team' 
            },
            { status: 404 }
          );
        }

        websiteName = websiteData.name || 'Unknown Website';
        currentBalance = websiteData.balance || 0;

      } else {
        // Use websiteName (legacy method)
        console.log('Using websiteName:', requestData.websiteName);
        const websitesQuery = query(
          collection(db, 'websites'),
          where('name', '==', requestData.websiteName),
          where('teamId', '==', apiTeamId)
        );
        
        const websitesSnapshot = await getDocs(websitesQuery);
        
        if (websitesSnapshot.empty) {
          console.log('Website not found:', requestData.websiteName);
          return NextResponse.json(
            { 
              success: false,
              error: 'Website not found in your team' 
            },
            { status: 404 }
          );
        }

        const websiteDoc = websitesSnapshot.docs[0];
        const websiteData = websiteDoc.data();
        currentBalance = websiteData.balance || 0;
        websiteId = websiteDoc.id;
        websiteName = requestData.websiteName!;
      }

      // Check if website has sufficient balance
      if (currentBalance < requestData.amount) {
        console.log('Insufficient balance:', { current: currentBalance, requested: requestData.amount });
        return NextResponse.json(
          { 
            success: false,
            error: 'Insufficient balance',
            currentBalance: currentBalance,
            requestedAmount: requestData.amount
          },
          { status: 400 }
        );
      }

      // Calculate new balance after withdrawal
      const newBalance = currentBalance - requestData.amount;

      // Update website balance
      console.log('Updating website balance...');
      await updateDoc(doc(db, 'websites', websiteId), {
        balance: newBalance,
        updatedAt: serverTimestamp()
      });

      // Create transaction document
      console.log('Creating new withdrawal transaction...');
      const transactionData = {
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

      const docRef = await addDoc(collection(db, 'transactions'), transactionData);
      console.log('Withdrawal transaction created with ID:', docRef.id);

      return NextResponse.json({
        success: true,
        message: 'Withdrawal transaction created successfully',
        data: {
          id: docRef.id,
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
          createdAt: new Date().toISOString()
        }
      }, { status: 201 });

    } catch (dbError) {
      console.error('Database error:', dbError);
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
    console.log('API called: GET /api/team/transactions');
    
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