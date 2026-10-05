# Tank Game Online Server

هذا السيرفر بديل Firebase للعبة الاستراتيجية، ويستخدم Node.js + Express + WebSocket.

## التشغيل محلياً

```bash
npm install
npm start
```

السيرفر يستمع على:
`http://localhost:10000`

WebSocket:
`ws://localhost:10000/ws`

## النشر على Render

أنشئ **Web Service** واربط مستودع GitHub الذي يحتوي هذه الملفات.

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

Render يحدد المنفذ من متغير `PORT`، والكود مربوط على `0.0.0.0`.

بعد النشر سيكون الاتصال من اللعبة:

```js
const SERVER_HTTP = "https://tank-game-server-o650.onrender.com";
const SERVER_WS = "wss://tank-game-server-o650.onrender.com/ws";
```

## رسائل WebSocket الأساسية

### تعريف اللاعب

```js
ws.send(JSON.stringify({
  type: "profile",
  name: "Player 1",
  color: "#2f7d32"
}));
```

### إنشاء غرفة

```js
ws.send(JSON.stringify({
  type: "create_room",
  name: "Battle Room",
  password: "1234",
  maxPlayers: 4
}));
```

### الانضمام

```js
ws.send(JSON.stringify({
  type: "join_room",
  roomId: "ROOM_ID",
  password: "1234"
}));
```

### جاهز

```js
ws.send(JSON.stringify({
  type: "ready",
  ready: true
}));
```

### بدء المعركة

```js
ws.send(JSON.stringify({
  type: "start_game"
}));
```

### مزامنة حالة اللعبة

```js
ws.send(JSON.stringify({
  type: "state_patch",
  patch: {
    units: {},
    buildings: {},
    projectiles: {},
    effects: {}
  }
}));
```

### أحداث المعركة

```js
ws.send(JSON.stringify({
  type: "game_event",
  event: {
    action: "fire",
    unitId: "tank_1",
    targetId: "tank_2"
  }
}));
```

## ملاحظة مهمة

حالة الغرف الموجودة في هذه النسخة محفوظة في ذاكرة السيرفر. إذا أعاد Render تشغيل الخدمة أو نقل الاتصال إلى instance أخرى، لن تبقى الغرف القديمة. هذا مناسب كبداية واختبار.

للتوسعة لاحقاً يمكن إضافة Redis/Render Key Value أو PostgreSQL لتخزين الحسابات والغرف والحالة الدائمة.
