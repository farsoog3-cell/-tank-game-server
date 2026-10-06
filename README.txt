CONTROL BATTLE — Render server fix

سبب الخطأ الذي ظهر في Render:
Render كان يشغل:
    node server.js
لكن الملف الموجود كان اسمه:
    control-battle-server.js

هذه الحزمة تصلح ذلك بوضع السيرفر نفسه باسم server.js.

Render:
Build Command: npm install
Start Command: npm start

Health:
GET /health

WebSocket:
wss://YOUR-RENDER-DOMAIN

بعد رفع الحزمة، اعمل Manual Deploy / Clear build cache إن لزم.
