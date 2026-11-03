const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// تخزين الروابط المنشأة والبيانات التي تم جمعها
const generatedLinks = {};

// 1. الصفحة الرئيسية: تحتوي على زر إنشاء رابط جديد وقائمة الأجهزة المتصلة
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>منشئ روابط فحص الأجهزة</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 500px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            button { background: #4CAF50; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
            button:hover { background: #45a049; }
            input { width: 80%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; text-align: center; margin-top: 10px; }
            .info-box { text-align: right; background: #2a2a2a; padding: 12px; border-radius: 6px; margin-top: 10px; border-right: 4px solid #4CAF50; font-size: 14px; line-height: 1.6; }
        </style>
    </head>
    <body>
        <h2>🛠️ أداة اختبار واستقبال معلومات الجهاز</h2>
        <div class="card">
            <button onclick="generateLink()">🔗 إنشاء رابط اختبار جديد</button>
            <div id="linkContainer" style="display:none;">
                <p>الرابط الخاص بك جاهز (قم بنسخه وفتحه في أي جهاز):</p>
                <input type="text" id="linkInput" readonly>
            </div>
        </div>

        <h3>📥 المعلومات المستلمة من الرابط:</h3>
        <div id="logs" class="card">
            <p style="color: #aaa;">لم يتم استقبال أي بيانات بعد... قم بإنشاء رابط وفتحه لتجربة الاستقبال.</p>
        </div>

        <script>
            function generateLink() {
                const uniqueId = Math.random().toString(36).substring(2, 9);
                const fullUrl = window.location.origin + '/track/' + uniqueId;
                document.getElementById('linkInput').value = fullUrl;
                document.getElementById('linkContainer').style.display = 'block';
            }

            // استقبال البيانات فورياً عبر Socket.io
            const script = document.createElement('script');
            script.src = "/socket.io/socket.io.js";
            script.onload = () => {
                const socket = io();
                socket.on('new-device-data', (data) => {
                    const logs = document.getElementById('logs');
                    if (logs.innerText.includes('لم يتم استقبال')) logs.innerHTML = '';
                    
                    const box = document.createElement('div');
                    box.className = 'info-box';
                    box.innerHTML = \`
                        <strong> المعرّف (ID):</strong> \${data.linkId}<br>
                        <strong>📱 نوع الجهاز والمنصة:</strong> \${data.platform}<br>
                        <strong>🌐 المتصفح والمعلومات:</strong> \${data.userAgent}<br>
                        <strong>🔋 نسبة الشحن:</strong> \${data.battery}<br>
                        <strong>🕒 الوقت المحلي:</strong> \${data.time}<br>
                        <strong>🖥️ أبعاد الشاشة:</strong> \${data.screenResolution}
                    \`;
                    logs.prepend(box);
                });
            };
            document.head.appendChild(script);
        </script>
    </body>
    </html>
  `);
});

// 2. صفحة الرابط الفريد (/track/:id): تستخرج معلومات الجهاز وترسلها للسيرفر
app.get('/track/:id', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>جاري الفحص...</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #111; color: #fff; text-align: center; padding: 50px; }
            .loader { border: 4px solid #333; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <h2>جاري فحص توافق الجهاز...</h2>
        <div class="loader"></div>
        <p id="status">أهلاً بك! يتم إعداد بيانات الاختبار الخاصة بجهازك.</p>

        <script>
            async function collectAndSend() {
                let batteryLevel = "غير مدعوم في هذا المتصفح";
                if (navigator.getBattery) {
                    try {
                        const b = await navigator.getBattery();
                        batteryLevel = Math.round(b.level * 100) + "% " + (b.charging ? "(جاري الشحن ⚡)" : "(على البطارية)");
                    } catch(e){}
                }

                const deviceData = {
                    linkId: "${req.params.id}",
                    userAgent: navigator.userAgent,
                    platform: navigator.platform || navigator.userAgentData?.platform || "غير معروف",
                    battery: batteryLevel,
                    time: new Date().toLocaleTimeString('ar-EG'),
                    screenResolution: window.screen.width + "x" + window.screen.height
                };

                fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deviceData)
                }).then(() => {
                    document.getElementById('status').innerText = "تم إرسال معلومات الجهاز بنجاح إلى الصفحة الرئيسية!";
                });
            }

            collectAndSend();
        </script>
    </body>
    </html>
  `);
});

// 3. مسار استقبال البيانات من الرابط الفريد وإرسالها للصفحة الرئيسية
app.post('/api/log', (req, res) => {
  const data = req.body;
  io.emit('new-device-data', data); // بث البيانات المباشرة للواجهة
  res.json({ status: 'success' });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
