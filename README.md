
# TANK COMMAND — Multiplayer FPS Server

هذا السيرفر Node.js + WebSocket ومجهز للنشر على Render أو أي خدمة Node.

## الوظائف
- إنشاء غرف وانضمام اللاعبين بواسطة رمز.
- حتى 16 لاعباً في الغرفة.
- مزامنة الموقع والاتجاه.
- صحة 100 HP لكل لاعب.
- إطلاق نار server-authoritative.
- ضرر 25 لكل إصابة.
- منع إطلاق النار السريع.
- كشف مدى الإصابة واتجاه التصويب على السيرفر.
- حالة الموت `player_died`.
- إعادة الظهور `respawn`.
- بث الحالة لجميع اللاعبين.
- `/health` لفحص السيرفر.

## تشغيل محلياً
```bash
npm install
npm start
```

## Render
أنشئ Web Service من هذا المجلد:
- Build Command: `npm install`
- Start Command: `npm start`

بعد النشر يكون WebSocket:
`wss://YOUR-SERVICE.onrender.com/ws`

واختبار الصحة:
`https://YOUR-SERVICE.onrender.com/health`

## مهم
هذا السيرفر لا يحاول استخدام REST مكان WebSocket. العميل يجب أن يتصل بـ `/ws`.
