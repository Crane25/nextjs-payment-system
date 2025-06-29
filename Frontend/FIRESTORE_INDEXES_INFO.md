# 🔥 **Firestore Indexes - สำคัญ!**

## 📋 **Indexes ที่จำเป็น**

### **transactions Collection:**
1. `teamId` (ASC) + `status` (ASC) + `createdAt` (ASC) ⭐
2. `idempotencyKey` (ASC) ✅
3. `teamId` (ASC) + `createdAt` (DESC) ✅

### **audit_logs Collection:**
1. `teamId` (ASC) + `timestamp` (DESC)
2. `action` (ASC) + `timestamp` (DESC)

---

## 🔗 **สร้าง Indexes**

**Firebase Console:** https://console.firebase.google.com/project/paymentnew-dae57/firestore/indexes

**วิธีสร้าง:**
1. คลิก "Create Index"
2. Collection: `transactions`
3. Fields: `teamId` → `status` → `createdAt` (ทั้งหมด Ascending)
4. Create และรอ 5-10 นาที

---

## ⚠️ **สำคัญ:** ต้องสร้าง Index ก่อนใช้งาน API! 