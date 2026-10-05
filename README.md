# Tank Game Server + PostgreSQL

هذه النسخة تربط سيرفر اللعبة تلقائياً بقاعدة Render PostgreSQL عبر `DATABASE_URL`.

## الحل لمشكلة DATABASE_URL is missing

الخطأ الذي ظهر في Render يعني أن خدمة الويب لم تحصل على متغير `DATABASE_URL`.

ملف `render.yaml` الموجود هنا يعرّف قاعدة باسم `tank-game-db` ويربطها تلقائياً بالسيرفر:

```yaml
envVars:
  - key: DATABASE_URL
    fromDatabase:
      name: tank-game-db
      property: connectionString
```

عند استخدام Render Blueprint على المستودع الذي يحتوي هذا الملف، يقوم Render بربط السيرفر بقاعدة PostgreSQL تلقائياً.

## إذا كانت خدمة tank-game-server موجودة مسبقاً

لا تنشئ خدمة ثانية بنفس الاسم. استخدم Blueprint/Sync على نفس المشروع والمستودع، أو أضف قاعدة PostgreSQL من Render Dashboard ثم في خدمة السيرفر:

Environment → Environment Variables → Add Environment Variable

Name:
`DATABASE_URL`

Value:
Internal Database URL لقاعدة PostgreSQL.

ثم اختر Save and Deploy.

## ماذا يحفظ السيرفر؟

- اللاعبين
- أسماء وألوان اللاعبين
- الغرف
- كلمة مرور الغرفة كـ SHA-256 hash
- صاحب الغرفة
- أعضاء الغرفة وحالة الجاهزية
- حالة المعركة
- الوحدات
- المباني
- المقذوفات
- التأثيرات
- آخر حدث قتالي

الجداول تنشأ تلقائياً عند أول تشغيل.

## عناوين السيرفر

HTTP:
`https://tank-game-server-o650.onrender.com`

WebSocket:
`wss://tank-game-server-o650.onrender.com/ws`

Health:
`https://tank-game-server-o650.onrender.com/health`

إذا كانت قاعدة البيانات متصلة، يجب أن يرجع Health قيمة:

```json
{"ok":true,"database":true}
```
