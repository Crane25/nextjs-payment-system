# Pending Transactions API

API สำหรับดึงธุรกรรมที่มีสถานะ "รอโอน" ทีละ 1 รายการ และอัปเดตสถานะเป็น "กำลังโอน" อัตโนมัติ

## Endpoint
```
GET /api/team/pending-transactions
```

## Authentication
ใช้ Team API Key ในการยืนยันตัวตน

### Headers
```
Authorization: Bearer <team_api_key>
Content-Type: application/json
```

## Request
ไม่ต้องส่ง body สำหรับ GET request

## Response

### Success Response (200) - Transaction Found
```json
{
  "success": true,
  "teamId": "team_id_here",
  "teamName": "ชื่อทีม",
  "message": "Transaction retrieved and status updated to \"กำลังโอน\"",
  "transaction": {
    "id": "transaction_doc_id",
    "transactionId": "TXN_123456",
    "customerUsername": "user123",
    "websiteName": "เว็บไซต์ A",
    "websiteId": "website_id_here",
    "bankName": "ธนาคารกรุงเทพ",
    "accountNumber": "1234567890",
    "realName": "นาย ทดสอบ ระบบ",
    "amount": 1000,
    "balanceBefore": 5000,
    "balanceAfter": 4000,
    "status": "กำลังโอน",
    "type": "withdraw",
    "note": null,
    "createdAt": "2024-01-01T10:00:00.000Z",
    "updatedAt": "2024-01-01T10:05:00.000Z",
    "createdBy": "api",
    "lastModifiedBy": null,
    "lastModifiedByEmail": null,
    "lastModifiedAt": null
  }
}
```

### Success Response (200) - No Pending Transactions
```json
{
  "success": true,
  "teamId": "team_id_here",
  "teamName": "ชื่อทีม",
  "message": "No pending transactions found",
  "transaction": null
}
```

### Error Responses

#### 401 - Unauthorized
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

#### 503 - Database Error
```json
{
  "success": false,
  "error": "Database connection failed",
  "details": "Error details here",
  "note": "The API requires Firebase security rules to allow read access, or proper authentication setup"
}
```

#### 500 - Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "details": "Error details here"
}
```

## Example Usage

### cURL
```bash
curl -X GET "https://your-domain.com/api/team/pending-transactions" \
  -H "Authorization: Bearer your_team_api_key_here" \
  -H "Content-Type: application/json"
```

### JavaScript (fetch)
```javascript
const response = await fetch('/api/team/pending-transactions', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_team_api_key_here',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();

if (data.success) {
  if (data.transaction) {
    console.log('Retrieved transaction:', data.transaction);
    console.log('Transaction ID:', data.transaction.transactionId);
    console.log('Status updated to:', data.transaction.status);
  } else {
    console.log('No pending transactions found');
  }
} else {
  console.error('Error:', data.error);
}
```

### PHP
```php
<?php
$teamApiKey = 'your_team_api_key_here';

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'https://your-domain.com/api/team/pending-transactions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $teamApiKey,
    'Content-Type: application/json'
]);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);

if ($data['success']) {
    if ($data['transaction']) {
        $transaction = $data['transaction'];
        echo "Retrieved transaction:\n";
        echo "Transaction ID: " . $transaction['transactionId'] . "\n";
        echo "Amount: " . $transaction['amount'] . "\n";
        echo "Customer: " . $transaction['customerUsername'] . "\n";
        echo "Status: " . $transaction['status'] . "\n";
        echo "Bank: " . $transaction['bankName'] . "\n";
        echo "Account: " . $transaction['accountNumber'] . "\n";
        echo "Real Name: " . $transaction['realName'] . "\n";
    } else {
        echo "No pending transactions found\n";
    }
} else {
    echo "Error: " . $data['error'] . "\n";
}
?>
```

## Features
- ✅ ใช้ Team API Key ในการยืนยันตัวตน
- ✅ ดึงธุรกรรมทีละ 1 รายการ (FIFO - First In, First Out)
- ✅ อัปเดตสถานะจาก "รอโอน" เป็น "กำลังโอน" อัตโนมัติ
- ✅ รวมข้อมูลครบถ้วน รวมถึงหมายเหตุและผู้แก้ไขล่าสุด
- ✅ Error handling ที่ครอบคลุม
- ✅ Logging สำหรับ debugging

## Notes
- API นี้จะคืนเฉพาะธุรกรรมที่เป็นของทีมที่ใช้ API Key
- ดึงทีละ 1 รายการและอัปเดตสถานะทันที
- สถานะจะเปลี่ยนจาก "รอโอน" → "กำลังโอน" 
- หากไม่มีธุรกรรมที่รอโอน จะคืน transaction: null
- เหมาะสำหรับระบบประมวลผลธุรกรรมแบบ queue 