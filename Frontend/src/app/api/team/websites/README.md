# Team Websites API

API endpoint สำหรับดึงรายชื่อเว็บไซต์ทั้งหมดในทีมที่สถานะเปิดอยู่

## Endpoint

```
GET /api/team/websites
```

## Authentication

ใช้ Team API Key ผ่าน Authorization header:

```
Authorization: Bearer <TEAM_API_KEY>
```

## Request Example

```bash
curl -H "Authorization: Bearer YOUR_TEAM_API_KEY" \
     https://scjsnext.com/api/team/websites
```

```javascript
fetch('https://scjsnext.com/api/team/websites', {
  headers: {
    'Authorization': 'Bearer YOUR_TEAM_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));
```

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "teamId": "team_id_here",
  "teamName": "ชื่อทีม",
  "websiteCount": 3,
  "websites": [
    {
      "name": "เว็บไซต์ 1",
      "url": "https://website1.com",
      "apiKey": "website_api_key_1",
      "balance": 1500.50
    },
    {
      "name": "เว็บไซต์ 2", 
      "url": "https://website2.com",
      "apiKey": "website_api_key_2",
      "balance": 2300.75
    },
    {
      "name": "เว็บไซต์ 3",
      "url": "https://website3.com", 
      "apiKey": "website_api_key_3",
      "balance": 890.25
    }
  ]
}
```

### Error Responses

#### 401 - Missing Authorization Header
```json
{
  "error": "Missing or invalid Authorization header. Use: Bearer <team_api_key>"
}
```

#### 401 - Invalid API Key
```json
{
  "error": "Invalid team API key"
}
```

#### 500 - Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | สถานะความสำเร็จของการร้องขอ |
| `teamId` | string | ID ของทีม |
| `teamName` | string | ชื่อทีม |
| `websiteCount` | number | จำนวนเว็บไซต์ที่เปิดใช้งาน |
| `websites` | array | รายชื่อเว็บไซต์ |
| `websites[].name` | string | ชื่อเว็บไซต์ |
| `websites[].url` | string | URL ของเว็บไซต์ |
| `websites[].apiKey` | string | API Key ของเว็บไซต์ |
| `websites[].balance` | number | ยอดคงเหลือของเว็บไซต์ |

## Notes

- เฉพาะเว็บไซต์ที่มีสถานะ `isActive: true` เท่านั้นที่จะถูกส่งกลับ
- API Key ของทีมต้องถูกต้องและเป็นของทีมที่มีอยู่จริง
- ไม่ต้องการการยืนยันตัวตนผ่าน Firebase Auth สำหรับ API นี้