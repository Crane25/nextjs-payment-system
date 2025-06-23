import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils } from '../../../../utils/jwt';
import { SecurityMonitor } from '../../../../utils/securityHeaders';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    
    // Get token from Authorization header or cookie
    let token = '';
    const authHeader = request.headers.get('authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Try to get from cookie
      const cookieToken = request.cookies.get('auth-token');
      if (cookieToken) {
        token = cookieToken.value;
      }
    }

    if (!token) {
      return NextResponse.json(
        { isValid: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    // Validate token
    const validation = await JWTUtils.validateToken(token);
    
    if (!validation.isValid) {
      SecurityMonitor.logEvent('token_verification_failed', { 
        ip,
        error: validation.error,
        userAgent: request.headers.get('user-agent') || 'unknown'
      }, 'medium');
      
      return NextResponse.json(
        { isValid: false, error: validation.error },
        { status: 401 }
      );
    }

    const payload = validation.payload!;

    // Check if token needs refresh
    const refreshedToken = await JWTUtils.refreshTokenIfNeeded(token);
    
    SecurityMonitor.logEvent('token_verification_success', { 
      userId: payload.sub,
      role: payload.role,
      ip,
      refreshed: !!refreshedToken
    }, 'low');

    const response = NextResponse.json({
      isValid: true,
      user: {
        id: payload.sub,
        role: payload.role,
        teamId: payload.teamId,
        permissions: payload.permissions
      },
      expiresAt: payload.exp ? payload.exp * 1000 : null,
      refreshed: !!refreshedToken
    }, {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    });

    // Set new token if refreshed
    if (refreshedToken) {
      response.cookies.set('auth-token', refreshedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600, // 1 hour
        path: '/'
      });
      
      // Also return new token in response for client-side storage
      response.headers.set('X-New-Token', refreshedToken);
    }

    return response;

  } catch (error) {
    SecurityMonitor.logEvent('token_verification_error', { 
      error: error instanceof Error ? error.message : 'Unknown',
      ip: getClientIP(request)
    }, 'high');

    return NextResponse.json(
      { isValid: false, error: 'Verification failed' },
      { status: 500 }
    );
  }
}

function getClientIP(request: NextRequest): string {
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip'
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      const ip = value.split(',')[0].trim();
      return ip;
    }
  }

  return request.ip || 'unknown';
}