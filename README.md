# Tank Game Online Server — PostgreSQL Edition

هذه النسخة تستخدم PostgreSQL لحفظ بيانات اللاعبين والغرف وحالة المعركة، وWebSocket للمزامنة اللحظية.

## Render
1. أنشئ PostgreSQL Database في Render.
2. أنشئ Web Service من GitHub.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. أضف متغير البيئة `DATABASE_URL` وضع فيه **Internal Database URL** لقاعدة Render PostgreSQL.
6. بعد النشر سيكون:
   - HTTP: `https://tank-game-server-o650.onrender.com`
   - WebSocket: `wss://tank-game-server-o650.onrender.com/ws`

السيرفر ينشئ الجداول تلقائياً عند أول تشغيل: players, rooms, room_players.

## ما يتم حفظه
- أسماء وألوان اللاعبين.
- الغرف وكلمات المرور بصيغة hash وليست نصاً مكشوفاً.
- أعضاء الغرف والجاهزية.
- المضيف وحالة بدء المباراة.
- حالة الوحدات والمباني والمقذوفات والتأثيرات.
- آخر أحداث المعركة.

ملاحظة: كلمة المرور لا تُحفظ كنص صريح. البيانات تبقى في PostgreSQL حتى بعد إعادة تشغيل السيرفر.
