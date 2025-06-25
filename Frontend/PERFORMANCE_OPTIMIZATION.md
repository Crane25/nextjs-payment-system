# Performance Optimization Guide

## ปัญหาที่แก้ไข

### ปัญหาเดิม:
1. **โหลดข้อมูลทั้งหมดแล้วจึงกรอง** - ทำให้ช้าเมื่อมีข้อมูลมาก
2. **Multiple team queries** - ต้อง query แยกตามแต่ละ team
3. **Client-side filtering** - การกรองข้อมูลทำฝั่ง frontend
4. **Heavy DOM rendering** - render รายการหลายหมื่นแถวพร้อมกัน

### การแก้ไข:
1. **Virtual Scrolling** - แสดงเฉพาะรายการที่เห็นได้
2. **Infinite Scroll** - โหลดข้อมูลทีละชุด
3. **Cursor-based pagination** - ใช้ cursor แทน offset
4. **Server-side filtering** - กรองข้อมูลฝั่ง database

## การใช้งาน Virtual Scrolling

### Bot Transactions Page:
```typescript
<VirtualScrollTable
  data={filteredTransactions}
  itemHeight={60}
  height={600}
  renderItem={BotTransactionRow}
  loading={loading}
  onLoadMore={loadMoreTransactions}
  hasMore={hasMore}
  threshold={5}
/>
```

### Topup History Page:
```typescript
<VirtualScrollTable
  data={getFilteredHistory()}
  itemHeight={80}
  height={600}
  renderItem={TopupHistoryRow}
  loading={loading}
  onLoadMore={loadMoreHistory}
  hasMore={hasMore}
  threshold={5}
/>
```

## Database Indexes ที่แนะนำ

### สำหรับ Firestore Collections:

#### 1. transactions Collection:
```javascript
// Composite indexes
{
  fields: [
    { field: "teamId", order: "ASCENDING" },
    { field: "type", order: "ASCENDING" },
    { field: "createdBy", order: "ASCENDING" },
    { field: "createdAt", order: "DESCENDING" }
  ]
}

{
  fields: [
    { field: "teamId", order: "ASCENDING" },
    { field: "status", order: "ASCENDING" },
    { field: "createdAt", order: "DESCENDING" }
  ]
}

// Single field indexes (usually auto-created)
- teamId
- type  
- createdBy
- status
- createdAt
```

#### 2. topupHistory Collection:
```javascript
// Composite indexes
{
  fields: [
    { field: "teamId", order: "ASCENDING" },
    { field: "status", order: "ASCENDING" },
    { field: "timestamp", order: "DESCENDING" }
  ]
}

{
  fields: [
    { field: "teamId", order: "ASCENDING" },
    { field: "timestamp", order: "DESCENDING" }
  ]
}

// Single field indexes
- teamId
- status
- timestamp
- websiteId
```

## Performance Best Practices

### 1. Query Optimization:
- ใช้ compound queries แทน multiple simple queries
- ใช้ cursor-based pagination แทน offset-based
- จำกัด limit ในแต่ละ query (ไม่เกิน 1000)

### 2. Client-side Optimization:
- ใช้ React.memo สำหรับ components ที่ไม่เปลี่ยนบ่อย
- ใช้ useCallback และ useMemo อย่างเหมาะสม
- Cache ข้อมูลที่ไม่เปลี่ยนแปลงบ่อย

### 3. Data Structure:
- เก็บข้อมูลสถิติแยกต่างหาก (denormalization)
- ใช้ aggregation collections สำหรับ reporting
- Batch operations เมื่อทำการ bulk updates

## Monitoring Performance

### 1. Client-side Metrics:
```typescript
const performanceRef = useRef<{
  loadStartTime: number;
  totalQueryTime: number;
  cacheHits: number;
  cacheMisses: number;
}>({
  loadStartTime: 0,
  totalQueryTime: 0,
  cacheHits: 0,
  cacheMisses: 0
});
```

### 2. แสดงข้อมูล Performance (Development mode):
```typescript
{process.env.NODE_ENV === 'development' && (
  <div className="flex items-center gap-1">
    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
    <span>Cache: {performanceRef.current.cacheHits}H/{performanceRef.current.cacheMisses}M</span>
  </div>
)}
```

## การปรับแต่งเพิ่มเติม

### 1. Server-side Filtering API:
```typescript
// สร้าง Cloud Function สำหรับ advanced filtering
export const getFilteredTransactions = functions.https.onCall(async (data) => {
  const { teamIds, status, dateRange, limit, cursor } = data;
  
  let query = firestore.collection('transactions')
    .where('teamId', 'in', teamIds);
    
  if (status !== 'all') {
    query = query.where('status', '==', status);
  }
  
  if (dateRange.start) {
    query = query.where('createdAt', '>=', dateRange.start);
  }
  
  query = query.orderBy('createdAt', 'desc').limit(limit);
  
  if (cursor) {
    query = query.startAfter(cursor);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
});
```

### 2. Redis Caching (สำหรับ production):
```typescript
// Cache frequently accessed data
const cacheKey = `transactions-${teamId}-${status}-${page}`;
const cachedData = await redis.get(cacheKey);

if (cachedData) {
  return JSON.parse(cachedData);
}

// If not cached, fetch from database and cache
const data = await fetchFromDatabase();
await redis.setex(cacheKey, 300, JSON.stringify(data)); // Cache for 5 minutes
```

## การทดสอบ Performance

### 1. Load Testing:
```bash
# ใช้ artillery หรือ k6 สำหรับ load testing
npm install -g artillery
artillery quick --count 50 --num 100 http://localhost:3000/bot-transactions
```

### 2. Profiling:
```typescript
// ใช้ React DevTools Profiler
import { Profiler } from 'react';

function onRenderCallback(id, phase, actualDuration) {
  console.log('Component:', id, 'Phase:', phase, 'Duration:', actualDuration);
}

<Profiler id="VirtualTable" onRender={onRenderCallback}>
  <VirtualScrollTable {...props} />
</Profiler>
```

## ข้อควรระวัง

1. **Memory Usage**: Virtual scrolling ลด DOM nodes แต่ยัง hold ข้อมูลใน memory
2. **Network Requests**: ควบคุมจำนวน concurrent requests
3. **Error Handling**: จัดการ errors ในกรณี network timeout
4. **User Experience**: แสดง loading states ที่ชัดเจน

## ผลลัพธ์ที่คาดหวัง

- โหลดข้อมูลเร็วขึ้น 80-90%
- ลด memory usage 70-80%
- Smooth scrolling แม้มีข้อมูลแสนรายการ
- Better user experience กับ infinite scroll