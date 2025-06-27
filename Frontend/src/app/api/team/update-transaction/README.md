# Update Transaction Status API

API endpoint สำหรับอัพเดทสถานะของธุรกรรมเป็น "สำเร็จ" หรือ "ล้มเหลว" พร้อมระบบคืนเครดิตอัตโนมัติ

## Endpoint

```
POST /api/team/update-transaction
```

## Authentication

ใช้ Team API Key ผ่าน Authorization header:

```
Authorization: Bearer <TEAM_API_KEY>
```

## Request Body

```json
{
  "id": "sXp5hgKPY2HjQuBFkR2D",
  "status": "สำเร็จ",
  "note": "หมายเหตุเพิ่มเติม (ไม่บังคับ)"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Document ID ของธุรกรรมใน Firestore |
| `status` | string | ✅ | สถานะใหม่: "สำเร็จ" หรือ "ล้มเหลว" |
| `note` | string | ❌ | หมายเหตุเพิ่มเติม |

## Request Examples

### อัพเดทเป็นสำเร็จ

```bash
curl -X POST https://scjsnext.com/api/team/update-transaction \
  -H "Authorization: Bearer YOUR_TEAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "sXp5hgKPY2HjQuBFkR2D",
    "status": "สำเร็จ",
    "note": "โอนเงินเรียบร้อยแล้ว"
  }'
```

### อัพเดทเป็นล้มเหลว (จะคืนเครดิตอัตโนมัติ)

```bash
curl -X POST https://scjsnext.com/api/team/update-transaction \
  -H "Authorization: Bearer YOUR_TEAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "sXp5hgKPY2HjQuBFkR2D",
    "status": "ล้มเหลว",
    "note": "ข้อมูลบัญชีไม่ถูกต้อง"
  }'
```

### JavaScript Example

```javascript
// อัพเดทเป็นสำเร็จ
fetch('https://scjsnext.com/api/team/update-transaction', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TEAM_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: 'sXp5hgKPY2HjQuBFkR2D',
    status: 'สำเร็จ',
    note: 'โอนเงินเรียบร้อยแล้ว'
  })
})
.then(response => response.json())
.then(data => console.log(data));

// อัพเดทเป็นล้มเหลว
fetch('https://scjsnext.com/api/team/update-transaction', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TEAM_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: 'sXp5hgKPY2HjQuBFkR2D',
    status: 'ล้มเหลว',
    note: 'ข้อมูลบัญชีไม่ถูกต้อง'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## Response Format

### Success Response (200) - สำเร็จ

```json
{
  "success": true,
  "teamId": "5S7Xo4OV0P45zuU2UrFT",
  "teamName": "YYYY",
  "id": "sXp5hgKPY2HjQuBFkR2D",
  "transactionId": "319",
  "oldStatus": "กำลังโอน",
  "newStatus": "สำเร็จ",
  "message": "Transaction status updated to \"สำเร็จ\"",
  "website": {
    "id": "uviFrLmb8fcWrgx85Dta",
    "name": "test224",
    "currentBalance": 19980
  }
}
```

### Success Response (200) - ล้มเหลว พร้อมคืนเครดิต

```json
{
  "success": true,
  "teamId": "5S7Xo4OV0P45zuU2UrFT",
  "teamName": "YYYY",
  "id": "sXp5hgKPY2HjQuBFkR2D",
  "transactionId": "319",
  "oldStatus": "กำลังโอน",
  "newStatus": "ล้มเหลว",
  "message": "Transaction status updated to \"ล้มเหลว\"",
  "website": {
    "id": "uviFrLmb8fcWrgx85Dta",
    "name": "test224",
    "currentBalance": 19985
  },
  "creditRefund": {
    "websiteId": "uviFrLmb8fcWrgx85Dta",
    "websiteName": "test224",
    "refundAmount": 5,
    "message": "Credit refunded: 5 THB"
  }
}
```

### Error Responses

#### 400 - Invalid Request

```json
{
  "success": false,
  "error": "Transaction document ID is required"
}
```

```json
{
  "success": false,
  "error": "Status must be either \"สำเร็จ\" or \"ล้มเหลว\""
}
```

```json
{
  "success": false,
  "error": "Transaction cannot be updated. Current status: สำเร็จ"
}
```

#### 401 - Authentication Error

```json
{
  "success": false,
  "error": "Missing or invalid Authorization header. Use: Bearer <team_api_key>"
}
```

```json
{
  "success": false,
  "error": "Invalid team API key"
}
```

#### 404 - Transaction Not Found

```json
{
  "success": false,
  "error": "Transaction not found in your team"
}
```

#### 500 - Credit Refund Error

```json
{
  "success": false,
  "error": "Failed to process credit refund",
  "details": "Website not found"
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | สถานะความสำเร็จของการร้องขอ |
| `teamId` | string | ID ของทีม |
| `teamName` | string | ชื่อทีม |
| `id` | string | Document ID ของธุรกรรมใน Firestore |
| `transactionId` | string | Transaction ID ที่แสดงให้ผู้ใช้เห็น |
| `oldStatus` | string | สถานะเดิม |
| `newStatus` | string | สถานะใหม่ |
| `message` | string | ข้อความแจ้งผลลัพธ์ |
| `website` | object | ข้อมูลเว็บไซต์และยอดคงเหลือล่าสุด |
| `website.id` | string | ID ของเว็บไซต์ |
| `website.name` | string | ชื่อเว็บไซต์ |
| `website.currentBalance` | number | ยอดคงเหลือล่าสุดของเว็บไซต์ |
| `creditRefund` | object | ข้อมูลการคืนเครดิต (เฉพาะกรณีล้มเหลว) |
| `creditRefund.websiteId` | string | ID ของเว็บไซต์ที่ได้รับเครดิตคืน |
| `creditRefund.websiteName` | string | ชื่อเว็บไซต์ |
| `creditRefund.refundAmount` | number | จำนวนเงินที่คืน |
| `creditRefund.message` | string | ข้อความแจ้งการคืนเครดิต |

## Features

### ✅ ระบบคืนเครดิตอัตโนมัติ
- เมื่ออัพเดทสถานะเป็น "ล้มเหลว" ระบบจะคืนเครดิตให้เว็บไซต์อัตโนมัติ
- เฉพาะธุรกรรมประเภท "withdraw" เท่านั้น
- อัพเดทยอดเงินคงเหลือของเว็บไซต์ทันที

### ✅ การตรวจสอบสิทธิ์
- ตรวจสอบ Team API Key
- ตรวจสอบว่าธุรกรรมเป็นของทีมที่ถูกต้อง
- ตรวจสอบสถานะปัจจุบันของธุรกรรม

### ✅ สถานะที่อัพเดทได้
- ธุรกรรมที่มีสถานะ "รอโอน" หรือ "กำลังโอน" เท่านั้น
- ไม่สามารถอัพเดทธุรกรรมที่เสร็จสิ้นแล้ว

### ✅ การบันทึกข้อมูล
- บันทึก timestamp การอัพเดท
- บันทึกหมายเหตุ (ถ้ามี)
- บันทึก completion timestamp สำหรับธุรกรรมสำเร็จ

### ✅ ข้อมูลยอดคงเหลือ
- แสดงยอดคงเหลือล่าสุดของเว็บไซต์ในทุกการตอบกลับ
- สำหรับธุรกรรมล้มเหลว จะแสดงยอดหลังจากคืนเครดิตแล้ว
- สำหรับธุรกรรมสำเร็จ จะแสดงยอดปัจจุบันของเว็บไซต์

## Usage Flow

1. **ดึงธุรกรรมที่รอดำเนินการ**: ใช้ `/api/team/pending-transactions`
2. **ดำเนินการโอนเงิน**: ทำการโอนเงินตามข้อมูลธุรกรรม
3. **อัพเดทสถานะ**: ใช้ API นี้เพื่ออัพเดทผลลัพธ์
   - หากสำเร็จ: ส่ง `"status": "สำเร็จ"`
   - หากล้มเหลว: ส่ง `"status": "ล้มเหลว"` (ระบบจะคืนเครดิตอัตโนมัติ)

## Notes

- **Team API Key**: ใช้ API Key ของทีม ไม่ใช่ API Key ของเว็บไซต์
- **Transaction ID**: ใช้ Document ID (`id`) ที่ได้จาก pending-transactions API (เช่น "sXp5hgKPY2HjQuBFkR2D")
- **Credit Refund**: การคืนเครดิตจะทำงานเฉพาะธุรกรรม withdraw ที่ล้มเหลวเท่านั้น
- **Status Validation**: ระบบจะตรวจสอบว่าธุรกรรมสามารถอัพเดทได้หรือไม่
- **Atomic Operation**: การอัพเดทสถานะและการคืนเครดิตจะทำพร้อมกัน หากมีข้อผิดพลาดจะ rollback ทั้งหมด 