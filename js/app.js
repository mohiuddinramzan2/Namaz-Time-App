(function () {
    'use strict';

    // ---------- STATE ----------
    let coords = null;          // { lat, lng }
    let prayerTimes = null;     // adhan.PrayerTimes instance
    let settings = loadSettings();
    let compassListenerAdded = false;
    let qiblaBearing = null;

    const PRAYER_LABELS = {
        fajr: { name: 'ফজর', icon: '🌅' },
        sunrise: { name: 'সূর্যোদয়', icon: '☀️' },
        dhuhr: { name: 'যোহর', icon: '🌤️' },
        asr: { name: 'আসর', icon: '🌥️' },
        maghrib: { name: 'মাগরিব', icon: '🌇' },
        isha: { name: 'এশা', icon: '🌙' }
    };

    // ---------- SETTINGS PERSISTENCE ----------
    function loadSettings() {
        try {
            const raw = localStorage.getItem('prayerAppSettings');
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return {
            method: 'MuslimWorldLeague',
            madhab: 'Shafi',
            notify: false,
            city: null // { name, lat, lng } — শুধু ম্যানুয়াল বাছাই করলে সেট হয়
        };
    }

    function saveSettings() {
        localStorage.setItem('prayerAppSettings', JSON.stringify(settings));
    }

    // ---------- TOAST ----------
    function showToast(msg, duration = 2500) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.hidden = false;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.hidden = true; }, duration);
    }

    // ---------- LOCATION ----------
    function initLocation() {
        if (settings.city) {
            coords = { lat: settings.city.lat, lng: settings.city.lng };
            document.getElementById('locationLabel').textContent = settings.city.name;
            computeAndRender();
            return;
        }
        requestGeolocation();
    }

    function requestGeolocation() {
        document.getElementById('locationLabel').textContent = 'লোকেশন খোঁজা হচ্ছে...';
        if (!navigator.geolocation) {
            fallbackToDhaka('GPS সাপোর্ট নেই, ঢাকার সময় দেখানো হচ্ছে');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                document.getElementById('locationLabel').textContent =
                    `অক্ষাংশ ${coords.lat.toFixed(2)}, দ্রাঘিমাংশ ${coords.lng.toFixed(2)}`;
                computeAndRender();
            },
            () => {
                fallbackToDhaka('লোকেশন পারমিশন দেওয়া হয়নি, ঢাকার সময় দেখানো হচ্ছে');
            },
            { timeout: 8000 }
        );
    }

    function fallbackToDhaka(message) {
        const dhaka = CITIES[0];
        coords = { lat: dhaka.lat, lng: dhaka.lng };
        document.getElementById('locationLabel').textContent = dhaka.name + ' (ডিফল্ট)';
        showToast(message, 3500);
        computeAndRender();
    }

    // ---------- PRAYER TIME CALCULATION ----------
    let adhanWaitAttempts = 0;

    function computeAndRender() {
        if (!coords) return;

        if (typeof adhan === 'undefined') {
            // CDN script may still be loading (e.g. fallback chain kicked in) — retry briefly.
            adhanWaitAttempts++;
            if (adhanWaitAttempts <= 20) {
                setTimeout(computeAndRender, 300);
            } else {
                showToast('নামাজের সময় হিসাব করার লাইব্রেরি লোড হচ্ছে না। ইন্টারনেট সংযোগ চেক করে অ্যাপ আবার চালু করুন।', 6000);
            }
            return;
        }
        adhanWaitAttempts = 0;

        const coordinates = new adhan.Coordinates(coords.lat, coords.lng);
        const params = adhan.CalculationMethod[settings.method] ?
            adhan.CalculationMethod[settings.method]() :
            adhan.CalculationMethod.MuslimWorldLeague();
        params.madhab = settings.madhab === 'Hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;

        const date = new Date();
        prayerTimes = new adhan.PrayerTimes(coordinates, date, params);

        renderPrayerList();
        renderHijriDate(date);
        startCountdown();
        computeQibla();
        scheduleNotifications();
    }

    function formatTime(d) {
        return d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
    }

    function renderPrayerList() {
        const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
        const current = prayerTimes.currentPrayer();
        const list = document.getElementById('prayerList');
        list.innerHTML = '';

        order.forEach((key) => {
            const adhanKey = key.charAt(0).toUpperCase() + key.slice(1);
            const time = prayerTimes[key];
            const isActive = adhan.Prayer[adhanKey] === current;

            const row = document.createElement('div');
            row.className = 'prayer-row' + (isActive ? ' active' : '');
            row.innerHTML = `
                <div class="name"><span class="icon">${PRAYER_LABELS[key].icon}</span> ${PRAYER_LABELS[key].name}</div>
                <div class="time">${formatTime(time)}</div>
            `;
            list.appendChild(row);
        });
    }

    function renderHijriDate(date) {
        document.getElementById('hijriDate').textContent = getHijriDateString(date);
    }

    // ---------- COUNTDOWN ----------
    let countdownInterval = null;

    function startCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        tickCountdown();
        countdownInterval = setInterval(tickCountdown, 1000);
    }

    function tickCountdown() {
        if (!prayerTimes) return;
        const now = new Date();
        let next = prayerTimes.nextPrayer();
        let nextTime;

        if (next === adhan.Prayer.None) {
            // আজকের সব নামাজ শেষ — কালকের ফজর দেখাও
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const coordinates = new adhan.Coordinates(coords.lat, coords.lng);
            const params = adhan.CalculationMethod[settings.method] ?
                adhan.CalculationMethod[settings.method]() :
                adhan.CalculationMethod.MuslimWorldLeague();
            params.madhab = settings.madhab === 'Hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
            const tomorrowTimes = new adhan.PrayerTimes(coordinates, tomorrow, params);
            nextTime = tomorrowTimes.fajr;
            document.getElementById('nextPrayerName').textContent = 'ফজর (আগামীকাল)';
        } else {
            nextTime = prayerTimes.timeForPrayer(next);
            const key = Object.keys(adhan.Prayer).find(k => adhan.Prayer[k] === next);
            const labelKey = key ? key.toLowerCase() : null;
            document.getElementById('nextPrayerName').textContent =
                labelKey && PRAYER_LABELS[labelKey] ? PRAYER_LABELS[labelKey].name : '--';
        }

        const diffMs = nextTime - now;
        if (diffMs <= 0) {
            computeAndRender(); // সময় পার হয়ে গেলে রিফ্রেশ
            return;
        }

        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        document.getElementById('countdownTimer').textContent =
            `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    function pad(n) { return n.toString().padStart(2, '0'); }

    // ---------- QIBLA ----------
    function computeQibla() {
        if (!coords || typeof adhan === 'undefined') return;
        const coordinates = new adhan.Coordinates(coords.lat, coords.lng);
        qiblaBearing = adhan.Qibla(coordinates);
    }

    function setupQiblaCompass() {
        const btn = document.getElementById('enableCompassBtn');
        btn.addEventListener('click', async () => {
            if (typeof DeviceOrientationEvent !== 'undefined' &&
                typeof DeviceOrientationEvent.requestPermission === 'function') {
                // iOS 13+ পারমিশন
                try {
                    const result = await DeviceOrientationEvent.requestPermission();
                    if (result !== 'granted') {
                        document.getElementById('qiblaStatus').textContent = 'কম্পাস পারমিশন দেওয়া হয়নি';
                        return;
                    }
                } catch (e) {
                    document.getElementById('qiblaStatus').textContent = 'কম্পাস এই ডিভাইসে সাপোর্ট করছে না';
                    return;
                }
            }
            attachCompassListener();
        });
    }

    function attachCompassListener() {
        if (compassListenerAdded) return;
        compassListenerAdded = true;

        const eventName = 'ondeviceorientationabsolute' in window ?
            'deviceorientationabsolute' : 'deviceorientation';

        window.addEventListener(eventName, (event) => {
            if (qiblaBearing === null) {
                document.getElementById('qiblaStatus').textContent = 'লোকেশন পাওয়া যায়নি, আগে লোকেশন দিন';
                return;
            }
            const heading = event.alpha !== null ? (360 - event.alpha) : null;
            if (heading === null) {
                document.getElementById('qiblaStatus').textContent = 'এই ডিভাইসে কম্পাস ডেটা পাওয়া যাচ্ছে না';
                return;
            }
            const rotation = qiblaBearing - heading;
            document.getElementById('qiblaNeedle').style.transform = `rotate(${rotation}deg)`;
            document.getElementById('qiblaStatus').textContent =
                `কাবার দিক: ${Math.round(qiblaBearing)}° (ফোন ঘুরিয়ে 🕋 আইকন উপরে রাখুন)`;
        });

        document.getElementById('qiblaStatus').textContent = 'কম্পাস চালু হয়েছে — ফোন সমান রেখে ঘোরান';
    }

    // ---------- TABS ----------
    function setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
                document.getElementById('app').querySelector('.countdown-card').hidden = false;
                document.getElementById('app').querySelector('.prayer-list').hidden = false;

                const tab = btn.dataset.tab;
                if (tab === 'qibla') {
                    document.getElementById('tab-qibla').hidden = false;
                    document.querySelector('.countdown-card').hidden = true;
                    document.querySelector('.prayer-list').hidden = true;
                } else if (tab === 'settings') {
                    document.getElementById('tab-settings').hidden = false;
                    document.querySelector('.countdown-card').hidden = true;
                    document.querySelector('.prayer-list').hidden = true;
                }
            });
        });
    }

    // ---------- SETTINGS UI ----------
    function setupSettingsUI() {
        const methodSelect = document.getElementById('methodSelect');
        const madhabSelect = document.getElementById('madhabSelect');
        const notifyToggle = document.getElementById('notifyToggle');

        methodSelect.value = settings.method;
        madhabSelect.value = settings.madhab;
        notifyToggle.checked = settings.notify;

        methodSelect.addEventListener('change', () => {
            settings.method = methodSelect.value;
            saveSettings();
            computeAndRender();
        });

        madhabSelect.addEventListener('change', () => {
            settings.madhab = madhabSelect.value;
            saveSettings();
            computeAndRender();
        });

        notifyToggle.addEventListener('change', async () => {
            if (notifyToggle.checked) {
                const granted = await requestNotificationPermission();
                if (!granted) {
                    notifyToggle.checked = false;
                    showToast('নোটিফিকেশন পারমিশন দেওয়া হয়নি');
                    return;
                }
                showToast('নামাজের নোটিফিকেশন চালু হয়েছে');
            }
            settings.notify = notifyToggle.checked;
            saveSettings();
        });

        document.getElementById('refreshLocationBtn').addEventListener('click', () => {
            settings.city = null;
            saveSettings();
            requestGeolocation();
        });

        document.getElementById('manualLocationBtn').addEventListener('click', openCityModal);
        document.getElementById('locationBtn').addEventListener('click', openCityModal);
    }

    // ---------- CITY MODAL ----------
    function openCityModal() {
        const modal = document.getElementById('cityModal');
        const list = document.getElementById('cityList');
        list.innerHTML = '';
        CITIES.forEach(city => {
            const btn = document.createElement('button');
            btn.className = 'city-item';
            btn.textContent = city.name;
            btn.addEventListener('click', () => {
                settings.city = city;
                saveSettings();
                coords = { lat: city.lat, lng: city.lng };
                document.getElementById('locationLabel').textContent = city.name;
                modal.hidden = true;
                computeAndRender();
            });
            list.appendChild(btn);
        });
        modal.hidden = false;
    }

    document.getElementById('closeCityModal')?.addEventListener('click', () => {
        document.getElementById('cityModal').hidden = true;
    });

    // ---------- NOTIFICATIONS ----------
    async function requestNotificationPermission() {
        // Capacitor নেটিভ অ্যাপের ভেতরে চললে নেটিভ Local Notifications প্লাগিন ব্যবহার করবে
        const isNativeApp = window.Capacitor && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform();

        if (isNativeApp && window.Capacitor.Plugins.LocalNotifications) {
            const perm = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
            return perm.display === 'granted';
        }

        // ব্রাউজারে চললে standard Web Notification API
        if ('Notification' in window) {
            const result = await Notification.requestPermission();
            return result === 'granted';
        }
        return false;
    }

    function scheduleNotifications() {
        if (!settings.notify || !prayerTimes) return;

        const isNativeApp = window.Capacitor && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform();

        const order = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        const now = new Date();

        if (isNativeApp && window.Capacitor.Plugins.LocalNotifications) {
            const notifications = order
                .map((key, idx) => {
                    const time = prayerTimes[key];
                    if (time <= now) return null;
                    return {
                        title: 'নামাজের সময় হয়েছে',
                        body: `${PRAYER_LABELS[key].name}-এর সময় হয়েছে`,
                        id: idx + 1,
                        schedule: { at: time }
                    };
                })
                .filter(Boolean);

            if (notifications.length) {
                window.Capacitor.Plugins.LocalNotifications.schedule({ notifications });
            }
        } else if ('Notification' in window && Notification.permission === 'granted') {
            // ব্রাউজারে শুধু চলমান সেশনে setTimeout দিয়ে (ট্যাব বন্ধ করলে কাজ করবে না)
            order.forEach((key) => {
                const time = prayerTimes[key];
                const diff = time - now;
                if (diff > 0 && diff < 24 * 3600000) {
                    setTimeout(() => {
                        new Notification('নামাজের সময় হয়েছে', {
                            body: `${PRAYER_LABELS[key].name}-এর সময় হয়েছে`
                        });
                    }, diff);
                }
            });
        }
    }

    // ---------- INIT ----------
    function init() {
        setupTabs();
        setupSettingsUI();
        setupQiblaCompass();
        initLocation();
    }

    document.addEventListener('DOMContentLoaded', init);

})();
