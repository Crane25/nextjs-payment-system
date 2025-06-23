import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface LogEntry {
  timestamp: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  category: 'auth' | 'profile' | 'team' | 'system' | 'security';
  details: string;
  ipAddress?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

// Function to get client IP (limited in browser environment)
const getClientIP = async (): Promise<string> => {
  try {
    // In a real application, you might want to use a service to get the real IP
    // For now, we'll just return a placeholder since real IP detection requires server-side implementation
    return 'Client IP';
  } catch (error) {
    return 'Unknown IP';
  }
};

export const logActivity = async (logData: Omit<LogEntry, 'timestamp' | 'ipAddress'>) => {
  try {
    // Get IP address (placeholder for now)
    const ipAddress = await getClientIP();
    
    const logEntry: LogEntry = {
      ...logData,
      timestamp: new Date().toISOString(),
      ipAddress
    };

    // Add to Firestore
    await addDoc(collection(db, 'systemLogs'), logEntry);
    

  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw error to avoid breaking main functionality
  }
};

// Specific logging functions for common activities
export const logLogin = async (userId: string, userEmail: string, userName: string) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'เข้าสู่ระบบ',
    category: 'auth',
    details: `Username: ${userName} เข้าสู่ระบบสำเร็จ (อีเมล: ${userEmail})`,
    severity: 'success'
  });
};

export const logSignup = async (userId: string, userEmail: string, userName: string) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'สมัครสมาชิก',
    category: 'auth',
    details: `Username: ${userName} สมัครสมาชิกใหม่สำเร็จ (อีเมล: ${userEmail})`,
    severity: 'success'
  });
};

export const logDisplayNameChange = async (
  userId: string, 
  userEmail: string, 
  userName: string, 
  oldName: string, 
  newName: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'เปลี่ยนชื่อที่ใช้แสดง',
    category: 'profile',
    details: `Username: ${userName} เปลี่ยนชื่อที่ใช้แสดงจาก "${oldName}" เป็น "${newName}"`,
    severity: 'info'
  });
};

export const logRoleChange = async (
  adminUserId: string,
  adminUserEmail: string,
  adminUserName: string,
  targetUserId: string,
  targetUserEmail: string,
  targetUserName: string,
  oldRole: string,
  newRole: string
) => {
  await logActivity({
    userId: adminUserId,
    userEmail: adminUserEmail,
    userName: adminUserName,
    action: 'เปลี่ยนสิทธิ์ผู้ใช้',
    category: 'security',
    details: `Admin Username: ${adminUserName} เปลี่ยนสิทธิ์ของ Username: ${targetUserName} (${targetUserEmail}) จากสิทธิ์ "${oldRole}" เป็นสิทธิ์ "${newRole}"`,
    severity: 'warning'
  });
};

// Legacy team functions - removed to avoid conflicts with new comprehensive functions

export const logError = async (
  userId: string,
  userEmail: string,
  userName: string,
  errorMessage: string,
  errorDetails?: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ข้อผิดพลาดระบบ',
    category: 'system',
    details: `Username: ${userName} - เกิดข้อผิดพลาด: ${errorMessage}${errorDetails ? ` (รายละเอียด: ${errorDetails})` : ''}`,
    severity: 'error'
  });
};

// ==================== WEBSITE MANAGEMENT LOGGING ====================

export const logWebsiteCreated = async (
  userId: string,
  userEmail: string,
  userName: string,
  websiteName: string,
  websiteUrl: string,
  teamName?: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'สร้างเว็บไซต์ใหม่',
    category: 'system',
    details: `Username: ${userName} สร้างเว็บไซต์ใหม่ "${websiteName}" (URL: ${websiteUrl})${teamName ? ` ในทีม "${teamName}"` : ''}`,
    severity: 'success'
  });
};

export const logWebsiteDeleted = async (
  userId: string,
  userEmail: string,
  userName: string,
  websiteName: string,
  websiteUrl: string,
  teamName?: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ลบเว็บไซต์',
    category: 'system',
    details: `Username: ${userName} ลบเว็บไซต์ "${websiteName}" (URL: ${websiteUrl})${teamName ? ` จากทีม "${teamName}"` : ''}`,
    severity: 'warning'
  });
};

export const logWebsiteStatusChanged = async (
  userId: string,
  userEmail: string,
  userName: string,
  websiteName: string,
  oldStatus: string,
  newStatus: string,
  teamName?: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'เปลี่ยนสถานะเว็บไซต์',
    category: 'system',
    details: `Username: ${userName} เปลี่ยนสถานะเว็บไซต์ "${websiteName}" จาก "${oldStatus}" เป็น "${newStatus}"${teamName ? ` ในทีม "${teamName}"` : ''}`,
    severity: 'info'
  });
};

export const logWebsiteTopup = async (
  userId: string,
  userEmail: string,
  userName: string,
  websiteName: string,
  amount: number,
  teamName?: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'เติมเงินเว็บไซต์',
    category: 'system',
    details: `Username: ${userName} เติมเงิน ${amount.toLocaleString()} บาท ให้เว็บไซต์ "${websiteName}"${teamName ? ` ในทีม "${teamName}"` : ''}`,
    severity: 'success'
  });
};

// ==================== TEAM MANAGEMENT LOGGING ====================

export const logTeamCreated = async (
  userId: string,
  userEmail: string,
  userName: string,
  teamName: string,
  teamDescription?: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'สร้างทีมใหม่',
    category: 'team',
    details: `Username: ${userName} สร้างทีมใหม่ "${teamName}"${teamDescription ? ` (คำอธิบาย: ${teamDescription})` : ''}`,
    severity: 'success'
  });
};

export const logTeamUpdated = async (
  userId: string,
  userEmail: string,
  userName: string,
  teamName: string,
  changes: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'แก้ไขข้อมูลทีม',
    category: 'team',
    details: `Username: ${userName} แก้ไขข้อมูลทีม "${teamName}" - ${changes}`,
    severity: 'info'
  });
};

export const logTeamMemberAdded = async (
  userId: string,
  userEmail: string,
  userName: string,
  memberEmail: string,
  memberName: string,
  teamName: string,
  role: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'เพิ่มสมาชิกทีม',
    category: 'team',
    details: `Username: ${userName} เพิ่ม ${memberName} (${memberEmail}) เข้าทีม "${teamName}" ในฐานะ ${role}`,
    severity: 'success'
  });
};

export const logTeamMemberRemoved = async (
  userId: string,
  userEmail: string,
  userName: string,
  memberEmail: string,
  memberName: string,
  teamName: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ลบสมาชิกทีม',
    category: 'team',
    details: `Username: ${userName} ลบ ${memberName} (${memberEmail}) ออกจากทีม "${teamName}"`,
    severity: 'warning'
  });
};

export const logTeamMemberRoleChanged = async (
  userId: string,
  userEmail: string,
  userName: string,
  memberEmail: string,
  memberName: string,
  teamName: string,
  oldRole: string,
  newRole: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'เปลี่ยนสิทธิ์สมาชิกทีม',
    category: 'team',
    details: `Username: ${userName} เปลี่ยนสิทธิ์ของ ${memberName} (${memberEmail}) ในทีม "${teamName}" จาก "${oldRole}" เป็น "${newRole}"`,
    severity: 'info'
  });
};

export const logTeamDeleted = async (
  userId: string,
  userEmail: string,
  userName: string,
  teamName: string,
  memberCount: number,
  websiteCount: number,
  totalBalance: number
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ลบทีม',
    category: 'team',
    details: `Username: ${userName} ลบทีม "${teamName}" ที่มีสมาชิก ${memberCount} คน, เว็บไซต์ ${websiteCount} เว็บ, ยอดเงินรวม ${totalBalance.toLocaleString()} บาท`,
    severity: 'error'
  });
};

export const logTeamInvitationSent = async (
  userId: string,
  userEmail: string,
  userName: string,
  invitedEmail: string,
  teamName: string,
  role: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ส่งคำเชิญเข้าทีม',
    category: 'team',
    details: `Username: ${userName} ส่งคำเชิญให้ ${invitedEmail} เข้าร่วมทีม "${teamName}" ในฐานะ ${role}`,
    severity: 'info'
  });
};

export const logTeamInvitationAccepted = async (
  userId: string,
  userEmail: string,
  userName: string,
  teamName: string,
  role: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ยอมรับคำเชิญเข้าทีม',
    category: 'team',
    details: `Username: ${userName} ยอมรับคำเชิญเข้าร่วมทีม "${teamName}" ในฐานะ ${role}`,
    severity: 'success'
  });
};

export const logTeamInvitationRejected = async (
  userId: string,
  userEmail: string,
  userName: string,
  teamName: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ปฏิเสธคำเชิญเข้าทีม',
    category: 'team',
    details: `Username: ${userName} ปฏิเสธคำเชิญเข้าร่วมทีม "${teamName}"`,
    severity: 'info'
  });
};

export const logTeamInvitationCancelled = async (
  userId: string,
  userEmail: string,
  userName: string,
  invitedEmail: string,
  teamName: string
) => {
  await logActivity({
    userId,
    userEmail,
    userName,
    action: 'ยกเลิกคำเชิญทีม',
    category: 'team',
    details: `Username: ${userName} ยกเลิกคำเชิญของ ${invitedEmail} เข้าร่วมทีม "${teamName}"`,
    severity: 'info'
  });
};

// ==================== ADMIN TEAM MANAGEMENT LOGGING ====================

export const logAdminTeamStatusChanged = async (
  adminUserId: string,
  adminUserEmail: string,
  adminUserName: string,
  teamName: string,
  oldStatus: string,
  newStatus: string,
  memberCount: number
) => {
  await logActivity({
    userId: adminUserId,
    userEmail: adminUserEmail,
    userName: adminUserName,
    action: 'Admin เปลี่ยนสถานะทีม',
    category: 'team',
    details: `Admin ${adminUserName} เปลี่ยนสถานะทีม "${teamName}" (สมาชิก ${memberCount} คน) จาก "${oldStatus}" เป็น "${newStatus}"`,
    severity: 'warning'
  });
};

export const logAdminTeamDeleted = async (
  adminUserId: string,
  adminUserEmail: string,
  adminUserName: string,
  teamName: string,
  memberCount: number,
  websiteCount: number,
  totalBalance: number
) => {
  await logActivity({
    userId: adminUserId,
    userEmail: adminUserEmail,
    userName: adminUserName,
    action: 'Admin ลบทีม',
    category: 'team',
    details: `Admin ${adminUserName} ลบทีม "${teamName}" ที่มีสมาชิก ${memberCount} คน, เว็บไซต์ ${websiteCount} เว็บ, ยอดเงินรวม ${totalBalance.toLocaleString()} บาท`,
    severity: 'error'
  });
};

// ==================== LEGACY FUNCTIONS (เก็บไว้เพื่อ backward compatibility) ====================

export const logTeamCreation = logTeamCreated; 