import { NextRequest, NextResponse } from 'next/server';
import { ame2eea } from '../../../utils/ame2eea';

export async function POST(request: NextRequest) {
  try {
    // Validate content type
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    // Parse request body
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON format' },
        { status: 400 }
      );
    }

    // Validate required parameters
    const { e2eeSid, pubKey, serverRandom, pin, oaepHashAlgo } = body;

    if (!e2eeSid || !pubKey || !serverRandom || !pin) {
      return NextResponse.json(
        { error: 'Missing required parameters: e2eeSid, pubKey, serverRandom, pin' },
        { status: 400 }
      );
    }

    // Validate pin format (basic validation)
    if (typeof pin !== 'string' || pin.length < 4 || pin.length > 12) {
      return NextResponse.json(
        { error: 'PIN must be a string between 4 and 12 characters' },
        { status: 400 }
      );
    }

    // Use default hash algorithm if not provided
    const hashAlgo = oaepHashAlgo || 'SHA-1';

    // Encrypt the PIN
    try {
      const encryptedResult = ame2eea.encryptPinForAM(e2eeSid, pubKey, serverRandom, pin, hashAlgo);
      
      return NextResponse.json({
        success: true,
        encryptedPin: encryptedResult,
        algorithm: hashAlgo
      });
    } catch (encryptionError) {
      console.error('Encryption error:', encryptionError);
      return NextResponse.json(
        { error: 'Encryption failed', details: encryptionError instanceof Error ? encryptionError.message : 'Unknown error' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to encrypt PIN.' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to encrypt PIN.' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to encrypt PIN.' },
    { status: 405 }
  );
} 