# Tactical Tank Game — Multiplayer Server

هذا السيرفر مطابق لبروتوكول الغرف الموجود في نسخة اللعبة الحالية.

## الملفات

- `server.js` — HTTP + WebSocket + الغرف + تعريف اللاعبين + مزامنة الحالة.
- `package.json` — اعتماد Node.js و `ws`.
- `render.yaml` — إعداد جاهز للنشر على Render.
- `public/index.html` — نسخة اللعبة المطابقة التي يمكن للسيرفر استضافتها مباشرة.

## تشغيل محلياً

```bash
npm install
npm start
```

السيرفر يستخدم `PORT` الذي توفره Render، والافتراضي محلياً `10000`، ويربط على `0.0.0.0`.

## Render

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

Health Check:

```text
/health
```

## WebSocket

رابط اللعبة الحالي:

```text
wss://tank-game-server-o650.onrender.com
```

## بروتوكول الغرف

يدعم السيرفر الرسائل التي تستخدمها اللعبة الحالية:

- `list_rooms`
- `create_room`
- `join_room`
- `set_color`
- `toggle_ready`
- `game_event`
- `leave_room`
- `ping`

ويرسل:

- `hello`
- `rooms`
- `room_created`
- `room_state`
- `game_start`
- `server_state`
- `peer_message`
- `match_end`

## قواعد المباراة

- غرفة واحدة = لاعبان فقط.
- لكل لاعب ID عشوائي مخفي يولده السيرفر.
- لكل لاعب لون مستقل.
- المال الابتدائي يحدد من إعداد الغرفة ويستخدمه اللاعبان.
- لا يوجد Bot ولا AI على السيرفر.
- السيرفر لا ينشئ عدواً محلياً؛ اللاعب الآخر هو الخصم الحقيقي.
- حالة اللاعب التي يرسلها العميل تُجمع في `server_state` ليشاهدها الطرف الآخر.

> ملاحظة: WebSocket على Render يعمل عبر `wss://` عند الوصول عبر HTTPS، وRender يتطلب أن يستمع تطبيق الويب على `0.0.0.0` والمنفذ الذي توفره البيئة. 
