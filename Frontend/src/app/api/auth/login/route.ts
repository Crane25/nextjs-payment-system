import { NextRequest, NextResponse } from 'next/server';
import { JWTUtils } from '../../../../utils/jwt';
import { SecurityMonitor } from '../../../../utils/securityHeaders';
import { InputValidator, OperationRateLimit } from '../../../../utils/validation';
import { config } from '../../../../config/env';

// Demo user data - in production, this would be in a database
const DEMO_USERS = [
  {
    id: 'user_admin_001',
    username: 'admin',
    email: 'admin@app.local',
    password: 'admin123', // In production, this would be hashed
    role: 'admin',
    teamId: 'team_001',
    permissions: ['admin:all', 'security:read', 'security:write', 'user:manage', 'team:manage']
  },
  {
    id: 'user_manager_001',
    username: 'manager',
    email: 'manager@app.local',
    password: 'manager123',
    role: 'manager',
    teamId: 'team_001',
    permissions: ['team:read', 'team:write', 'user:read', 'security:read']
  },
  {
    id: 'user_regular_001',
    username: 'user',
    email: 'user@app.local',
    password: 'user123',
    role: 'user',
    teamId: 'team_001',
    permissions: ['user:read']
  }
];

export async function POST(request: NextRequest) {
  try {
    // Get client info for security monitoring
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Rate limiting - prevent brute force attacks
    if (!OperationRateLimit.checkLimit(ip, 'login_attempt', 5, 15 * 60 * 1000)) {
      const remainingTime = OperationRateLimit.getRemainingTime(ip, 'login_attempt');
      
      SecurityMonitor.logEvent('login_rate_limited', { 
        ip, 
        userAgent,
        remainingTime 
      }, 'medium');
      
      return NextResponse.json(
        { 
          error: 'Too many login attempts. Please try again later.',
          retryAfter: Math.ceil(remainingTime / 1000)
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(remainingTime / 1000).toString()
          }
        }
      );
    }

    // Validate content type
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      SecurityMonitor.logEvent('login_invalid_content_type', { ip, contentType }, 'low');
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
      SecurityMonitor.logEvent('login_invalid_json', { ip }, 'low');
      return NextResponse.json(
        { error: 'Invalid JSON format' },
        { status: 400 }
      );
    }

    // Validate username/email
    const usernameValidation = InputValidator.validateText(body.username || body.email, {
      required: true,
      minLength: 3,
      maxLength: 50,
      allowSpecialChars: true,
      allowHtml: false
    });

    if (!usernameValidation.isValid) {
      SecurityMonitor.logEvent('login_invalid_username', { 
        ip, 
        error: usernameValidation.error 
      }, 'low');
      return NextResponse.json(
        { error: `Username validation failed: ${usernameValidation.error}` },
        { status: 400 }
      );
    }

    // Validate password
    const passwordValidation = InputValidator.validateText(body.password, {
      required: true,
      minLength: 1,
      maxLength: 128,
      allowSpecialChars: true,
      allowHtml: false
    });

    if (!passwordValidation.isValid) {
      SecurityMonitor.logEvent('login_invalid_password', { 
        ip, 
        error: passwordValidation.error 
      }, 'low');
      return NextResponse.json(
        { error: `Password validation failed: ${passwordValidation.error}` },
        { status: 400 }
      );
    }

    const username = usernameValidation.sanitizedValue;
    const password = passwordValidation.sanitizedValue;

    // Find user (in production, query database with proper password hashing)
    const user = DEMO_USERS.find(u => 
      u.username === username || u.email === username
    );

    if (!user || user.password !== password) {
      // Log failed login attempt
      SecurityMonitor.logEvent('login_failed', { 
        ip, 
        username: username.substring(0, 3) + '***', // Partial username for privacy
        userAgent,
        reason: !user ? 'user_not_found' : 'invalid_password'
      }, 'medium');

      // Generic error message to prevent user enumeration
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Check if account is locked (placeholder - implement actual account locking)
    const isAccountLocked = await checkAccountLock(user.id, ip);
    if (isAccountLocked) {
      SecurityMonitor.logEvent('login_blocked_locked_account', { 
        userId: user.id,
        ip,
        userAgent 
      }, 'high');
      
      return NextResponse.json(
        { error: 'Account is temporarily locked. Please try again later.' },
        { status: 423 }
      );
    }

    // Create JWT token
    try {
      const token = await JWTUtils.createToken({
        sub: user.id,
        role: user.role,
        teamId: user.teamId,
        permissions: user.permissions
      });

      // Log successful login
      SecurityMonitor.logEvent('login_success', { 
        userId: user.id,
        username: user.username,
        role: user.role,
        ip,
        userAgent
      }, 'low');

      // Reset rate limiting for successful login
      OperationRateLimit.resetLimit(ip, 'login_attempt');

      // Set secure cookie options based on environment
      const cookieOptions = {
        httpOnly: config.security.cookieHttpOnly,
        secure: config.security.cookieSecure,
        sameSite: config.security.cookieSameSite as 'strict' | 'lax' | 'none',
        maxAge: config.security.sessionTimeout / 1000, // Convert to seconds
        path: '/'
      };

      const response = NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          teamId: user.teamId,
          permissions: user.permissions
        },
        token,
        expiresAt: Date.now() + config.security.sessionTimeout
      }, {
        status: 200,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        }
      });

      // Set secure token cookie
      response.cookies.set('auth-token', token, cookieOptions);

      return response;

    } catch (error) {
      SecurityMonitor.logEvent('login_token_error', { 
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown',
        ip
      }, 'high');

      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable' },
        { status: 503 }
      );
    }

  } catch (error) {
    // Log unexpected errors
    SecurityMonitor.logEvent('login_unexpected_error', { 
      error: error instanceof Error ? error.message : 'Unknown',
      ip: getClientIP(request)
    }, 'high');

    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { 
        status: 503,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        }
      }
    );
  }
}

// Helper functions
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
      if (isValidIP(ip)) {
        return ip;
      }
    }
  }

  return request.ip || 'unknown';
}

function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

async function checkAccountLock(userId: string, ip: string): Promise<boolean> {
  // Placeholder implementation
  // In production, check database for account locks based on:
  // - Failed login attempts
  // - Suspicious activity
  // - Admin-imposed locks
  // - Time-based locks
  
  return false; // Account not locked
}

// Logout endpoint
export async function DELETE(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const authHeader = request.headers.get('authorization');
    
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const payload = JWTUtils.extractPayload(token);
      
      if (payload) {
        SecurityMonitor.logEvent('logout_success', { 
          userId: payload.sub,
          ip,
          userAgent: request.headers.get('user-agent') || 'unknown'
        }, 'low');
      }
    }

    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { 
        status: 200,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        }
      }
    );

    // Clear auth cookie
    response.cookies.set('auth-token', '', {
      httpOnly: true,
      secure: config.security.cookieSecure,
      sameSite: config.security.cookieSameSite as 'strict' | 'lax' | 'none',
      maxAge: 0,
      path: '/'
    });

    return response;

  } catch (error) {
    SecurityMonitor.logEvent('logout_error', { 
      error: error instanceof Error ? error.message : 'Unknown',
      ip: getClientIP(request)
    }, 'medium');

    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}