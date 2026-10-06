# Tank Game Multiplayer Server

هذا السيرفر متوافق مع WebSocket الموجود في لعبة Tank Game.

## تشغيل محلي
npm install
npm start

ثم:
http://localhost:10000/
ws://localhost:10000/ws

## Render
ارفع هذا المجلد إلى GitHub ثم أنشئ Web Service في Render.
Build Command: npm install
Start Command: npm start

بعد النشر سيكون:
https://YOUR-SERVICE.onrender.com/
wss://YOUR-SERVICE.onrender.com/ws

ضع رابط `/ws` في اللعبة بدل الرابط القديم إذا تغيّر اسم الخدمة.

## البروتوكول المدعوم
- hello
- presence / presence_list
- get_rooms / rooms_list
- create_room
- join_room
- settings
- ready
- start_battle / battle_start
- leave_room / peer_left
- invite / accept_invite / reject_invite
- state

السيرفر لا ينشئ لاعبين وهميين. كل لاعب في `presence_list` مرتبط باتصال WebSocket حي، ويتم تنظيف الاتصال بعد انقطاعه أو انتهاء المهلة.
