# Tank Game Multiplayer Server

هذا السيرفر مبني على Node.js + Express + Socket.IO.

## التشغيل محليًا

```bash
npm install
npm start
```

ثم افتح:
- `/`
- `/health`
- `/rooms`

## Render

- Build Command: `npm install`
- Start Command: `npm start`
- لا تضع PORT يدويًا؛ Render يمرره في `process.env.PORT`.

الرابط المتوقع بعد النشر:
`https://YOUR-SERVICE.onrender.com`

## ما يديره السيرفر

- إنشاء غرفة
- دخول لاعب ثانٍ
- Quick Match
- أسماء وألوان اللاعبين
- حالة الاستعداد
- إعداد المال والخريطة
- بدء المباراة فقط عند جاهزية لاعبين متصلين
- أوامر الحركة/الهجوم/البناء/الشراء/الدفاع/السيطرة
- مزامنة نبضات المباراة والوقت
- استقبال snapshots لحالة المباراة
- إنهاء المباراة وإعلان الفائز
- إبلاغ اللاعب عند انقطاع خصمه
- تنظيف الغرف المهجورة

## ربط لعبتك

أضف:

```html
<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
<script src="./tank-multiplayer-client.js"></script>
```

ثم:

```js
TankMP.quickMatch({
  name: "Player 1",
  color: "#168cff",
  money: 3000,
  map: "default"
});

TankMP.setReady(true);

TankMP.sendCommand("move", {
  unitId: "tank-1",
  x: 120,
  z: -50
});
```

لإنشاء غرفة بدل Quick Match:

```js
TankMP.createRoom({
  name: "Player 1",
  color: "#168cff",
  money: 3000,
  map: "default"
});
```

وللانضمام:

```js
TankMP.joinRoom({
  roomId: "ROOM_ID",
  name: "Player 2",
  color: "#ef4444"
});
```

### ملاحظة هندسية مهمة

الإصدار الحالي يجعل السيرفر مسؤولًا عن الغرف والاتصال والتحقق من الأوامر وتوزيع الحالة، لكنه لا يعيد تنفيذ محرك Three.js كاملًا على السيرفر. لذلك يجب لاحقًا نقل القواعد الحساسة مثل الضرر، الرصاص، المال، البناء، التقاط النفط والفوز إلى `server.js` إذا أردت Server-Authoritative Anti-Cheat بشكل كامل.
