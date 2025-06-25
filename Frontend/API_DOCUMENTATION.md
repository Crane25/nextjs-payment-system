# API Documentation - Withdrawal Transactions

## Overview
API สำหรับจัดการข้อมูลธุรกรรมการถอนเงิน (Withdrawal Transactions) โดยใช้ Team API Key ในการยืนยันตัวตน
- ตรวจสอบยอดเงินในเว็บไซต์ก่อนทำรายการ
- หักยอดเงินจากเว็บไซต์โดยอัตโนมัติ
- บันทึกประวัติการถอนเงิน

## Base URL
```
http://localhost:3000/api/team/transactions
```

## Authentication
ใช้ Team API Key ในการยืนยันตัวตน ผ่าน Authorization header:
```
Authorization: Bearer <TEAM_API_KEY>
```

---

## POST - Create Withdrawal Transaction
สร้างธุรกรรมการถอนเงินใหม่ (จะตรวจสอบยอดเงินและหักยอดออกจากเว็บไซต์)

### Endpoint
```
POST /api/team/transactions
```

### Headers
```
Content-Type: application/json
Authorization: Bearer <TEAM_API_KEY>
```

### Request Body

**ตัวเลือก 1: ใช้ websiteId (แนะนำ)**
```json
{
  "transactionId": "TXN-001",
  "customerUsername": "customer123",
  "websiteId": "website_firebase_id_1",
  "bankName": "ธนาคารกสิกรไทย",
  "accountNumber": "1234567890",
  "realName": "นายทดสอบ ระบบ",
  "amount": 1000.50
}
```

**ตัวเลือก 2: ใช้ websiteName (เก่า)**
```json
{
  "transactionId": "TXN-001",
  "customerUsername": "customer123",
  "websiteName": "เว็บไซต์ทดสอบ",
  "bankName": "ธนาคารกสิกรไทย",
  "accountNumber": "1234567890",
  "realName": "นายทดสอบ ระบบ",
  "amount": 1000.50
}
```

### Field Descriptions
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transactionId` | string | ✅ | ไอดีรายการที่คุณสร้างเอง (ต้องไม่ซ้ำ) |
| `customerUsername` | string | ✅ | ชื่อผู้ใช้งานของลูกค้าที่คุณกำหนด |
| `websiteId` | string | ⚠️ | ID ของเว็บไซต์ (ได้จาก `/api/team/websites`) |
| `websiteName` | string | ⚠️ | ชื่อเว็บไซต์ที่คุณกำหนด (วิธีเก่า) |
| `bankName` | string | ✅ | ชื่อธนาคาร |
| `accountNumber` | string | ✅ | เลขบัญชี |
| `realName` | string | ✅ | ชื่อจริง |
| `amount` | number | ✅ | จำนวนเงิน (ต้องเป็นตัวเลขบวก) |

**หมายเหตุ**: 
- ต้องส่ง `websiteId` **หรือ** `websiteName` อย่างใดอย่างหนึ่ง (ไม่ใช่ทั้งคู่)
- แนะนำให้ใช้ `websiteId` เพื่อความแม่นยำ
- `teamId` จะถูกกำหนดอัตโนมัติจาก API Key ที่ใช้ยืนยัน

### Success Response (201)
```json
{
  "success": true,
  "message": "Withdrawal transaction created successfully",
  "data": {
    "id": "firebase-document-id",
    "transactionId": "TXN-001",
    "customerUsername": "customer123",
    "websiteName": "เว็บไซต์ทดสอบ",
    "websiteId": "website-firebase-id",
    "bankName": "ธนาคารกสิกรไทย",
    "accountNumber": "1234567890",
    "realName": "นายทดสอบ ระบบ",
    "amount": 1000.50,
    "balanceBefore": 5000.00,
    "balanceAfter": 3999.50,
    "status": "รอโอน",
    "type": "withdraw",
    "teamId": "your-team-id",
    "teamName": "ชื่อทีม",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

### Error Responses

#### 400 - Bad Request
```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["transactionId", "amount"],
  "required": ["transactionId", "customerUsername", "bankName", "accountNumber", "realName", "amount"]
}
```

**หรือ**

```json
{
  "success": false,
  "error": "Either websiteName or websiteId is required"
}
```

**หรือ**

```json
{
  "success": false,
  "error": "Insufficient balance",
  "currentBalance": 500.00,
  "requestedAmount": 1000.50
}
```

#### 404 - Not Found
```json
{
  "success": false,
  "error": "Website not found in your team"
}
```

#### 401 - Unauthorized
```json
{
  "success": false,
  "error": "Invalid team API key"
}
```

#### 403 - Forbidden
*หมายเหตุ: Error นี้จะไม่เกิดขึ้นอีกต่อไป เนื่องจาก teamId จะถูกกำหนดอัตโนมัติจาก API Key*

#### 409 - Conflict
```json
{
  "success": false,
  "error": "Transaction with this customerUsername and transactionId combination already exists."
}
```

---

## GET - Retrieve Withdrawal Transactions
ดึงข้อมูลธุรกรรมการถอนเงินทั้งหมดของทีม

### Endpoint
```
GET /api/team/transactions
```

### Headers
```
Authorization: Bearer <TEAM_API_KEY>
```

### Success Response (200)
```json
{
  "success": true,
  "teamId": "your-team-id",
  "teamName": "ชื่อทีม",
  "transactionCount": 2,
  "transactions": [
    {
      "id": "firebase-document-id-1",
      "transactionId": "TXN-001",
      "customerUsername": "customer123",
      "websiteName": "เว็บไซต์ทดสอบ",
      "bankName": "ธนาคารกสิกรไทย",
      "accountNumber": "1234567890",
      "realName": "นายทดสอบ ระบบ",
      "amount": 1000.50,
      "status": "รอโอน",
      "teamId": "your-team-id",
      "teamName": "ชื่อทีม",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "createdBy": "api"
    }
  ]
}
```

---

## Example Usage

### cURL Example - Create Withdrawal Transaction

**ใช้ websiteId (แนะนำ):**
```bash
curl -X POST http://localhost:3000/api/team/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-team-api-key" \
  -d '{
    "transactionId": "TXN-001",
    "customerUsername": "customer123",
    "websiteId": "website_firebase_id_1",
    "bankName": "ธนาคารกสิกรไทย",
    "accountNumber": "1234567890",
    "realName": "นายทดสอบ ระบบ",
    "amount": 1000.50
  }'
```

**ใช้ websiteName (เก่า):**
```bash
curl -X POST http://localhost:3000/api/team/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-team-api-key" \
  -d '{
    "transactionId": "TXN-001",
    "customerUsername": "customer123",
    "websiteName": "เว็บไซต์ทดสอบ",
    "bankName": "ธนาคารกสิกรไทย",
    "accountNumber": "1234567890",
    "realName": "นายทดสอบ ระบบ",
    "amount": 1000.50
  }'
```

### cURL Example - Get Withdrawal Transactions
```bash
curl -X GET http://localhost:3000/api/team/transactions \
  -H "Authorization: Bearer your-team-api-key"
```

### JavaScript Example
```javascript
// Create Withdrawal Transaction (ใช้ websiteId - แนะนำ)
const createWithdrawalTransaction = async () => {
  const response = await fetch('http://localhost:3000/api/team/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-team-api-key'
    },
    body: JSON.stringify({
      transactionId: 'TXN-001',
      customerUsername: 'customer123',
      websiteId: 'website_firebase_id_1', // ใช้ ID แทน name
      bankName: 'ธนาคารกสิกรไทย',
      accountNumber: '1234567890',
      realName: 'นายทดสอบ ระบบ',
      amount: 1000.50
    })
  });
  
  const result = await response.json();
  console.log(result);
};

// Get Withdrawal Transactions
const getWithdrawalTransactions = async () => {
  const response = await fetch('http://localhost:3000/api/team/transactions', {
    headers: {
      'Authorization': 'Bearer your-team-api-key'
    }
  });
  
  const result = await response.json();
  console.log(result);
};
```

---

## Security Features

1. **API Key Authentication**: ใช้ Team API Key ในการยืนยันตัวตน
2. **Team Isolation**: แต่ละทีมสามารถเข้าถึงได้เฉพาะข้อมูลของตัวเอง
3. **Balance Validation**: ตรวจสอบยอดเงินในเว็บไซต์ก่อนอนุมัติการถอน
4. **Automatic Balance Deduction**: หักยอดเงินจากเว็บไซต์โดยอัตโนมัติ
5. **Duplicate Prevention**: ป้องกันการสร้าง customerUsername + transactionId ซ้ำ
6. **Input Validation**: ตรวจสอบข้อมูลที่ส่งมาครบถ้วนและถูกต้อง
7. **Audit Trail**: บันทึกข้อมูลการสร้างผ่าน API

---

## Database Schema
ข้อมูลจะถูกเก็บใน Firestore collection: `transactions`

```json
{
  "transactionId": "TXN-001",
  "customerUsername": "customer123",
  "websiteName": "เว็บไซต์ทดสอบ",
  "websiteId": "website-firebase-id",
  "bankName": "ธนาคารกสิกรไทย",
  "accountNumber": "1234567890",
  "realName": "นายทดสอบ ระบบ",
  "amount": 1000.50,
  "balanceBefore": 5000.00,
  "balanceAfter": 3999.50,
  "status": "รอโอน",
  "type": "withdraw",
  "teamId": "your-team-id",
  "teamName": "ชื่อทีม",
  "createdAt": "Firebase Timestamp",
  "updatedAt": "Firebase Timestamp",
  "createdBy": "api"
}
```

## Status Values
- `รอโอน` - สถานะเริ่มต้น (Default)
- สามารถเพิ่มสถานะอื่นๆ ได้ในอนาคต เช่น `ดำเนินการแล้ว`, `ยกเลิก` เป็นต้น 