export interface Permission {
  resource: 'websites' | 'topup' | 'users' | 'settings' | 'teams' | 'apiKeys';
  actions: ('create' | 'read' | 'update' | 'delete')[];
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  username?: string; // ชื่อผู้ใช้สำหรับแสดงผล
  role: 'admin' | 'manager' | 'user';
  permissions: Permission[];
  createdAt: string;
  lastLogin: string;
  ownerId?: string; // สำหรับสมาชิกทีม
  teamId?: string; // ทีมที่สังกัด
}

export interface TeamMember {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'user';
  permissions: Permission[];
  invitedAt: string;
  acceptedAt?: string;
  joinedAt?: string;
  invitedBy: string;
  status: 'pending' | 'active' | 'suspended' | 'inactive';
  teamId?: string; // ทีมที่สังกัด
  userId?: string; // ID ของผู้ใช้ในระบบ (ถ้ามี)
}

export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  teamId: string;
  ownerId: string;
  ownerName: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'rejected';
  expiresAt: string;
  createdAt: string;
}

export const ROLE_PERMISSIONS = {
  admin: {
    label: 'ผู้ดูแลระบบ',
    description: 'สิทธิ์สูงสุด จัดการทุกอย่างได้',
    permissions: [
      { resource: 'websites' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'topup' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'users' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'settings' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'teams' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'apiKeys' as const, actions: ['read'] as const }
    ]
  },
  manager: {
    label: 'ผู้จัดการ',
    description: 'จัดการเฉพาะทีมของตัวเอง สร้างและเชิญสมาชิกในทีมตัวเอง',
    permissions: [
      { resource: 'websites' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'topup' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'users' as const, actions: ['read', 'update'] as const },
      { resource: 'settings' as const, actions: ['read', 'update'] as const },
      { resource: 'teams' as const, actions: ['create', 'read', 'update', 'delete'] as const },
      { resource: 'apiKeys' as const, actions: ['read'] as const }
    ]
  },
  user: {
    label: 'ผู้ใช้',
    description: 'สามารถเติมเงิน ดูข้อมูลทีมที่สังกัด และแก้ไขข้อมูลส่วนตัวได้',
    permissions: [
      { resource: 'websites' as const, actions: ['read'] as const },
      { resource: 'topup' as const, actions: ['create', 'read'] as const },
      { resource: 'users' as const, actions: [] as const },
      { resource: 'settings' as const, actions: ['read', 'update'] as const },
      { resource: 'teams' as const, actions: ['read'] as const }
    ]
  }
} as const; 