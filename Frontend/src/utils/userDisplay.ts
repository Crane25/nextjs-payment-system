/**
 * Utility functions for consistent user display name handling
 */

export interface UserDisplayData {
  displayName?: string;
  username?: string;
  email?: string;
}

/**
 * Get the primary display name for a user
 * Priority: displayName > username > email prefix > fallback
 */
export function getUserDisplayName(user: UserDisplayData, fallback: string = 'ผู้ใช้'): string {
  // ใช้ displayName เป็นหลัก ถ้ามีและไม่ใช่ string ว่าง
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }
  
  // ถ้าไม่มี displayName ให้ใช้ username
  if (user.username && user.username.trim()) {
    return user.username.trim();
  }
  
  // ถ้าไม่มี username ให้ใช้ส่วนหน้าของ email
  if (user.email) {
    const emailPrefix = user.email.split('@')[0];
    if (emailPrefix && emailPrefix.trim()) {
      return emailPrefix.trim();
    }
  }
  
  // ถ้าไม่มีอะไรเลยให้ใช้ fallback
  return fallback;
}

/**
 * Get the first character for avatar display
 */
export function getUserAvatarInitial(user: UserDisplayData): string {
  const displayName = getUserDisplayName(user, 'U');
  return displayName.charAt(0).toUpperCase();
}

/**
 * Get formatted display text with email
 * Format: "Display Name (email@domain.com)"
 */
export function getUserDisplayWithEmail(user: UserDisplayData): string {
  const displayName = getUserDisplayName(user);
  if (user.email && user.email !== displayName) {
    return `${displayName} (${user.email})`;
  }
  return displayName;
}

/**
 * Check if user has a custom display name set
 */
export function hasCustomDisplayName(user: UserDisplayData): boolean {
  return !!(user.displayName && user.displayName.trim());
} 