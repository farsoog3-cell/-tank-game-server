<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>معركة السيطرة الاستراتيجية - خريطة مصغرة وتحكم متطور</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; touch-action: none; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body, html { width: 100%; height: 100%; overflow: hidden; background: #000; }
        #canvas-container { width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1; }
        
        #start-menu {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10;
            background: rgba(15, 23, 42, 0.95);
            display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff;
        }

        .menu-card {
            background: rgba(30, 41, 59, 0.95); border: 1px solid #38bdf8;
            border-radius: 12px; padding: 16px 20px; width: 90%; max-width: 380px; text-align: center;
        }

        .menu-card h1 { font-size: 16px; margin-bottom: 10px; color: #38bdf8; }
        .section-title { font-size: 11px; color: #94a3b8; margin: 6px 0 3px 0; text-align: right; }
        .flag-options { display: flex; gap: 8px; justify-content: center; margin-bottom: 8px; }

        .flag-btn {
            flex: 1; padding: 6px; border: 1px solid #475569; border-radius: 6px;
            background: #1e293b; color: #fff; font-weight: bold; font-size: 11px; cursor: pointer;
        }

        .flag-btn.active-player { border-color: #22c55e; background: rgba(34, 197, 94, 0.2); }
        .flag-btn.active-enemy { border-color: #ef4444; background: rgba(239, 68, 68, 0.2); }

        #start-btn {
            width: 100%; margin-top: 10px; padding: 8px; border: none; border-radius: 6px;
            background: #0284c7; color: #fff; font-size: 13px; font-weight: bold; cursor: pointer;
        }

        #ui-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 5; pointer-events: none; display: none;
        }

        .tank-hp-label {
            position: absolute; transform: translate(-50%, -100%);
            background: rgba(0, 0, 0, 0.75); padding: 1px 4px; border-radius: 3px;
            font-size: 9px; font-weight: bold; pointer-events: none; white-space: nowrap;
            border: 1px solid #334155; transition: transform 0.1s linear;
        }
        .hp-player { color: #22c55e; border-color: rgba(34, 197, 94, 0.4); }
        .hp-enemy { color: #ef4444; border-color: rgba(239, 68, 68, 0.4); }

        .top-capture-box {
            position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
            width: 210px; background: rgba(15, 23, 42, 0.85); border: 1px solid #38bdf8;
            border-radius: 6px; padding: 4px 8px; text-align: center; color: white; font-size: 10px;
        }
        .capture-bar-bg { width: 100%; height: 5px; background: #334155; border-radius: 3px; margin-top: 2px; overflow: hidden; }
        .capture-bar-fill { width: 0%; height: 100%; background: #22c55e; }

        .left-controls-group {
            position: absolute; top: 8px; left: 8px; pointer-events: auto;
            display: flex; flex-direction: column; gap: 6px; width: 130px;
        }

        .selection-controls { display: flex; gap: 4px; width: 100%; }
        .sel-btn {
            flex: 1; background: rgba(30, 41, 59, 0.85); border: 1px solid #38bdf8; color: white;
            padding: 5px 4px; border-radius: 5px; font-size: 10px; font-weight: bold; text-align: center; cursor: pointer;
        }
        .sel-btn.active { background: #0284c7; }

        .corner-economy {
            background: rgba(15, 23, 42, 0.85); border: 1px solid #f59e0b;
            border-radius: 6px; padding: 6px; display: flex; flex-direction: column; gap: 5px; width: 100%;
        }
        .money-row { display: flex; justify-content: space-between; align-items: center; }
        .money-small { color: #fbbf24; font-weight: bold; font-size: 11px; }
        
        .buy-btn-small {
            background: #22c55e; border: none; color: white; padding: 5px;
            border-radius: 4px; font-weight: bold; font-size: 9px; width: 100%; text-align: center; cursor: pointer;
        }
        .buy-btn-small:disabled { background: #64748b; }
        .buy-btn-rocket { background: #ea580c; }
        .buy-btn-rocket:disabled { background: #64748b; }

        /* تصميم الخريطة المصغرة */
        #minimap-container {
            position: absolute; bottom: 65px; left: 8px; width: 110px; height: 110px;
            background: rgba(15, 23, 42, 0.9); border: 2px solid #38bdf8; border-radius: 50%;
            overflow: hidden; pointer-events: auto; cursor: pointer; box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
        }
        #minimap-canvas { width: 100%; height: 100%; }

        #floating-msg {
            position: absolute; top: 52px; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75); color: #38bdf8; padding: 3px 8px;
            border-radius: 4px; font-size: 10px; pointer-events: none; opacity: 0; transition: opacity 0.4s;
        }

        .cam-controls {
            position: absolute; bottom: 8px; right: 8px;
            display: grid; grid-template-columns: repeat(3, 42px); gap: 4px;
            pointer-events: auto;
        }
        .cam-btn {
            width: 42px; height: 42px; background: rgba(30, 41, 59, 0.85);
            border: 1px solid #38bdf8; border-radius: 6px; color: white;
            font-size: 15px; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .cam-btn:active, .cam-btn.pressed { background: #0284c7; border-color: #7dd3fc; }
        .cam-btn.up { grid-column: 2; grid-row: 1; }
        .cam-btn.left { grid-column: 1; grid-row: 2; }
        .cam-btn.down { grid-column: 2; grid-row: 2; }
        .cam-btn.right { grid-column: 3; grid-row: 2; }
        .cam-btn.zoom-in { grid-column: 1; grid-row: 1; font-size: 12px; }
        .cam-btn.zoom-out { grid-column: 3; grid-row: 1; font-size: 12px; }

        .cam-hint {
            position: absolute; bottom: 8px; left: 125px;
            background: rgba(15, 23, 42, 0.75); border: 1px solid #38bdf8;
            color: #93c5fd; padding: 3px 6px; border-radius: 4px; font-size: 9px; pointer-events: none;
        }

        #victory-screen {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20;
            background: rgba(15, 23, 42, 0.95); display: none; flex-direction: column; align-items: center; justify-content: center; color: #fff;
        }
        #victory-screen h1 { font-size: 20px; color: #22c55e; margin-bottom: 6px; text-align: center; padding: 0 10px; }
        .stats-box {
            background: rgba(30, 41, 59, 0.9); border: 1px solid #38bdf8; border-radius: 8px;
            padding: 10px 16px; font-size: 11px; margin: 8px 0; width: 260px; text-align: right; line-height: 1.5;
        }
        #victory-flag-canvas { width: 180px; height: 100px; border-radius: 6px; margin: 6px 0; }
        .restart-btn { padding: 6px 16px; background: #22c55e; border: none; color: white; font-size: 12px; font-weight: bold; border-radius: 6px; cursor: pointer; }
    </style>
</head>
<body>

<div id="start-menu">
    <div class="menu-card">
        <h1>معركة السيطرة الاستراتيجية ⚔️🚩</h1>
        
        <div class="section-title">اختر علم معسكرك:</div>
        <div class="flag-options" id="player-flags">
            <button class="flag-btn active-player" onclick="playClickSound(); selectFlag('player', 'green')">الأخضر (3 نجوم)</button>
            <button class="flag-btn" onclick="playClickSound(); selectFlag('player', 'red')">الأحمر (نجمتان)</button>
        </div>

        <div class="section-title">اختر علم معسكر العدو:</div>
        <div class="flag-options" id="enemy-flags">
            <button class="flag-btn" onclick="playClickSound(); selectFlag('enemy', 'green')">الأخضر (3 نجوم)</button>
            <button class="flag-btn active-enemy" onclick="playClickSound(); selectFlag('enemy', 'red')">الأحمر (نجمتان)</button>
        </div>

        <button id="start-btn" onclick="playClickSound(); startGame()">بدء المعركة 🚀</button>
    </div>
</div>

<div id="ui-overlay">
    <div id="hp-labels-container" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; overflow:hidden;"></div>

    <div class="top-capture-box">
        <div id="capture-status-text">سيطر على معسكر العدو لتربح!</div>
        <div class="capture-bar-bg">
            <div id="capture-bar-fill" class="capture-bar-fill"></div>
        </div>
    </div>

    <div class="left-controls-group">
        <div class="selection-controls">
            <button class="sel-btn active" id="sel-all-btn" onclick="playClickSound(); setSelectionMode('all')">الكل</button>
            <button class="sel-btn" id="sel-single-btn" onclick="playClickSound(); setSelectionMode('single')">فردي</button>
        </div>

        <div class="corner-economy">
            <div class="money-row">
                <span style="font-size: 9px; color: #cbd5e1;">الرصيد:</span>
                <div class="money-small"><span id="money-display">500</span>$</div>
            </div>
            <button class="buy-btn-small" id="buy-tank-btn" onclick="playClickSound(); buyPlayerTank('normal')">عادية (150$)</button>
            <button class="buy-btn-small buy-btn-rocket" id="buy-rocket-tank-btn" onclick="playClickSound(); buyPlayerTank('rocket')">صاروخية (300$)</button>
        </div>
    </div>

    <!-- الخريطة المصغرة -->
    <div id="minimap-container" title="الخريطة المصغرة">
        <canvas id="minimap-canvas" width="110" height="110"></canvas>
    </div>

    <div id="floating-msg"></div>

    <div class="cam-controls">
        <button class="cam-btn zoom-in" 
            onmousedown="camMove('zi', true)" onmouseup="camMove('zi', false)" onmouseleave="camMove('zi', false)"
            ontouchstart="camMove('zi', true)" ontouchend="camMove('zi', false)">➕ تقريب</button>
        
        <button class="cam-btn up" 
            onmousedown="camMove('up', true)" onmouseup="camMove('up', false)" onmouseleave="camMove('up', false)"
            ontouchstart="camMove('up', true)" ontouchend="camMove('up', false)">⬆️</button>
        
        <button class="cam-btn zoom-out" 
            onmousedown="camMove('zo', true)" onmouseup="camMove('zo', false)" onmouseleave="camMove('zo', false)"
            ontouchstart="camMove('zo', true)" ontouchend="camMove('zo', false)">➖ إبعاد</button>
        
        <button class="cam-btn left" 
            onmousedown="camMove('left', true)" onmouseup="camMove('left', false)" onmouseleave="camMove('left', false)"
            ontouchstart="camMove('left', true)" ontouchend="camMove('left', false)">⬅️</button>
        
        <button class="cam-btn down" 
            onmousedown="camMove('down', true)" onmouseup="camMove('down', false)" onmouseleave="camMove('down', false)"
            ontouchstart="camMove('down', true)" ontouchend="camMove('down', false)">⬇️</button>
        
        <button class="cam-btn right" 
            onmousedown="camMove('right', true)" onmouseup="camMove('right', false)" onmouseleave="camMove('right', false)"
            ontouchstart="camMove('right', true)" ontouchend="camMove('right', false)">➡️</button>
    </div>

    <div class="cam-hint">اسحب بالشاشة أو استخدم الخريطة المصغرة والتحكم 🎯</div>
</div>

<div id="victory-screen">
    <h1 id="victory-title">انتهت المعركة!</h1>
    <div class="stats-box" id="stats-content"></div>
    <canvas id="victory-flag-canvas"></canvas>
    <button class="restart-btn" onclick="playClickSound(); location.reload()">إعادة المعركة 🔄</button>
</div>

<div id="canvas-container"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>

<script>
    const soundFiles = {
        menuBgm: 'sounds/menu_bgm.mp3',
        battleBgm: 'sounds/battle_bgm.mp3',
        click: 'sounds/click.mp3',
        attack: 'sounds/attack.mp3',
        danger: 'sounds/danger.mp3',
        victory: 'sounds/victory_sound.mp3',
        defeat: 'sounds/defeat_sound.mp3',
        shoot: 'sounds/shoot.mp3',
        rocket: 'sounds/rocket.mp3',
        explosion: 'sounds/explosion.mp3',
        buy: 'sounds/buy.mp3',
        idle: 'sounds/tank_idle.mp3',
        move: 'sounds/tank_move.mp3'
    };

    let menuBgmAudio = new Audio(soundFiles.menuBgm);
    menuBgmAudio.loop = true;
    menuBgmAudio.volume = 0.4;
    
    let battleBgmAudio = new Audio(soundFiles.battleBgm);
    battleBgmAudio.loop = true;
    battleBgmAudio.volume = 0.5;

    window.addEventListener('pointerdown', () => {
        if (menuBgmAudio.paused && document.getElementById('start-menu').style.display !== 'none') {
            menuBgmAudio.play().catch(e => {});
        }
    }, { once: true });

    function playClickSound() {
        const audio = new Audio(soundFiles.click);
        audio.volume = 0.6;
        audio.play().catch(e => {});
    }

    function playSound(type, volume = 1.0) {
        if (soundFiles[type]) {
            const audio = new Audio(soundFiles[type]);
            audio.volume = volume;
            audio.play().catch(e => {});
        }
    }

    let scene, camera, renderer, dirLight;
    let playerFlagType = 'green';
    let enemyFlagType = 'red';

    let cameraRadius = 280, targetCameraRadius = 280;
    let cameraTheta = Math.PI / 4;
    let cameraPhi = Math.PI / 3.5;
    let targetLookAt = new THREE.Vector3(0, 0, 0);

    let shakeTimer = 0;
    let shakeIntensity = 0;
    let camInputs = { up: false, down: false, left: false, right: false, zi: false, zo: false };

    let isDragging = false;
    let previousTouchX = 0;
    let previousTouchY = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;

    let playerTanks = [];
    let enemyTanks = [];
    let bullets = [];
    let tacticalMissiles = [];
    let shockwaves = [];
    let smokeParticles = [];
    let obstacles = []; 
    let rotatingRadars = [];
    let tankTracks = [];
    let treadTextureCache = null;
    let animatedRigs = [];

    let selectionMode = 'all';
    let selectedTank = null;
    let playerTargetPos = null;

    let targetMarkerMesh;
    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();
    let terrainMesh;

    let enemyPoleFlagMesh, playerPoleFlagMesh;
    let enemyFlagDataRef, playerFlagDataRef;
    let enemyFlagHeight = 38.5;
    let playerFlagHeight = 38.5;

    let captureProgress = 0;
    let enemyCaptureProgress = 0;
    let gameOver = false;
    let isCinematicEnding = false;
    let cinematicTargetLook = null;

    const CORNER_OFFSET = 380; 
    const MAP_LIMIT = 460;
    const CAPTURE_RADIUS = 38;
    const TANK_RADIUS = 4.5; 

    let playerMoney = 500;
    let enemyMoney = 500;
    let totalMoneySpent = 0;
    let totalTanksLost = 0;
    let enemyTanksLost = 0;
    let oilRigs = [];
    let gameTick = 0;
    let flagWaveTime = 0;
    let activeFlagMeshes = [];

    let playerBuildCooldown = 0;
    let enemyBuildCooldown = 0;

    function getTerrainHeight(x, z) {
        let h = Math.sin(x * 0.02) * Math.cos(z * 0.02) * 5 + Math.sin(x * 0.008) * 8;
        let distFromCenter = Math.sqrt(x * x + z * z);
        if (distFromCenter < 140) h *= 0.2;
        return h;
    }

    function showFloatingMsg(text) {
        const msg = document.getElementById('floating-msg');
        msg.innerText = text;
        msg.style.opacity = '1';
        setTimeout(() => { msg.style.opacity = '0'; }, 2000);
    }

    function init() {
        const container = document.getElementById('canvas-container');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x7dd3fc);
        scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0018);

        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500);
        updateCameraPosition();

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        setupLighting();
        createHillyBrownSoilTerrain();
        createBases();
        createOilRigs();
        createTargetMarker();
        setupInteraction();
        setupMinimapInteraction();

        updateEconomyUI();
        window.addEventListener('resize', onWindowResize);
        animate();
    }

    function camMove(dir, state) { camInputs[dir] = state; }

    function processCameraInputs() {
        if (isCinematicEnding) return;
        const moveSpeed = 5.0;
        let dx = 0, dz = 0;

        if (camInputs.up) { dx -= Math.sin(cameraTheta) * moveSpeed; dz -= Math.cos(cameraTheta) * moveSpeed; }
        if (camInputs.down) { dx += Math.sin(cameraTheta) * moveSpeed; dz += Math.cos(cameraTheta) * moveSpeed; }
        if (camInputs.left) { dx -= Math.cos(cameraTheta) * moveSpeed; dz += Math.sin(cameraTheta) * moveSpeed; }
        if (camInputs.right) { dx += Math.cos(cameraTheta) * moveSpeed; dz -= Math.sin(cameraTheta) * moveSpeed; }

        targetLookAt.x = Math.max(-420, Math.min(420, targetLookAt.x + dx));
        targetLookAt.z = Math.max(-420, Math.min(420, targetLookAt.z + dz));

        if (camInputs.zi) targetCameraRadius = Math.max(60, targetCameraRadius - 5);
        if (camInputs.zo) targetCameraRadius = Math.min(550, targetCameraRadius + 5);
    }

    function selectFlag(role, color) {
        if (role === 'player') {
            if (color === enemyFlagType) enemyFlagType = color === 'green' ? 'red' : 'green';
            playerFlagType = color;
        } else {
            if (color === playerFlagType) playerFlagType = color === 'green' ? 'red' : 'green';
            enemyFlagType = color;
        }
        updateFlagButtonsUI();
    }

    function updateFlagButtonsUI() {
        document.querySelectorAll('#player-flags .flag-btn').forEach(btn => {
            btn.classList.toggle('active-player', btn.innerText.includes(playerFlagType === 'green' ? 'الأخضر' : 'الأحمر'));
        });
        document.querySelectorAll('#enemy-flags .flag-btn').forEach(btn => {
            btn.classList.toggle('active-enemy', btn.innerText.includes(enemyFlagType === 'green' ? 'الأخضر' : 'الأحمر'));
        });
    }

    function setSelectionMode(mode) {
        selectionMode = mode;
        document.getElementById('sel-all-btn').classList.toggle('active', mode === 'all');
        document.getElementById('sel-single-btn').classList.toggle('active', mode === 'single');
        if (mode === 'all') selectedTank = null;
        showFloatingMsg(mode === 'all' ? 'تم تحديد جميع الدبابات' : 'اضغط على الدبابة لتحديدها');
    }

    function startGame() {
        menuBgmAudio.pause();
        menuBgmAudio.currentTime = 0;
        battleBgmAudio.play().catch(e => {});

        document.getElementById('start-menu').style.display = 'none';
        document.getElementById('ui-overlay').style.display = 'block';
        playSound('buy');

        let playerCampX = CORNER_OFFSET;
        let playerCampZ = CORNER_OFFSET;
        let terrainH = getTerrainHeight(playerCampX, playerCampZ);

        targetLookAt.set(playerCampX, terrainH, playerCampZ);
        targetCameraRadius = 110; 
        cameraPhi = Math.PI / 3.8;
        cameraRadius = targetCameraRadius;
        updateCameraPosition();

        showFloatingMsg('بدأت المعركة! الكاميرا الآن فوق معسكرك.');
    }

    function setupLighting() {
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        
        dirLight = new THREE.DirectionalLight(0xfffbeb, 1.2);
        dirLight.position.set(300, 450, 300);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 1200;
        let d = 450;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.bias = -0.0005;
        scene.add(dirLight);
    }

    function createHillyBrownSoilTerrain() {
        const geometry = new THREE.PlaneGeometry(1100, 1100, 50, 50);
        geometry.rotateX(-Math.PI / 2);

        const positionAttr = geometry.attributes.position;
        for (let i = 0; i < positionAttr.count; i++) {
            let px = positionAttr.getX(i);
            let pz = positionAttr.getZ(i);
            let h = getTerrainHeight(px, pz);
            positionAttr.setY(i, h);
        }
        geometry.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.9 });
        terrainMesh = new THREE.Mesh(geometry, terrainMat);
        terrainMesh.receiveShadow = true;
        scene.add(terrainMesh);
    }

    function createBaseStructure(parentGroup, isEnemy) {
        const wallMat = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x1e1b18 : 0x334155, roughness: 0.5 });
        const concreteMat = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x27272a : 0x64748b, roughness: 0.7 });
        const darkRoofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
        const glowMat = new THREE.MeshStandardMaterial({ 
            color: isEnemy ? 0xef4444 : 0x22c55e, 
            emissive: isEnemy ? 0x991b1b : 0x15803d, 
            roughness: 0.2 
        });
        const metalPlateMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.3, roughness: 0.4 });
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
        const windowMat = new THREE.MeshStandardMaterial({ 
            color: isEnemy ? 0xef4444 : 0x38bdf8, 
            emissive: isEnemy ? 0x991b1b : 0x0284c7, 
            roughness: 0.1 
        });

        [-18, 18].forEach(x => {
            const sideWall = new THREE.Mesh(new THREE.BoxGeometry(2.5, 7, 32), wallMat);
            sideWall.position.set(x, 3.5, 0); sideWall.castShadow = true; sideWall.receiveShadow = true; parentGroup.add(sideWall);
        });
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(38.5, 7, 2.5), wallMat);
        backWall.position.set(0, 3.5, 16); backWall.castShadow = true; backWall.receiveShadow = true; parentGroup.add(backWall);

        const hqBase = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 14), concreteMat);
        hqBase.position.set(0, 4, -4); hqBase.castShadow = true; hqBase.receiveShadow = true; parentGroup.add(hqBase);

        const mainDoor = new THREE.Mesh(new THREE.BoxGeometry(3, 4.5, 0.5), doorMat);
        mainDoor.position.set(0, 2.25, 3.1); parentGroup.add(mainDoor);

        [-5, 5].forEach(wx => {
            const windowObj = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 0.4), windowMat);
            windowObj.position.set(wx, 5.5, 3.1); parentGroup.add(windowObj);
        });

        const hqTop = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 10), metalPlateMat);
        hqTop.position.set(0, 10.5, -4); hqTop.castShadow = true; parentGroup.add(hqTop);

        const hqRoof = new THREE.Mesh(new THREE.BoxGeometry(14, 1.5, 12), darkRoofMat);
        hqRoof.position.set(0, 13.5, -4); hqRoof.castShadow = true; parentGroup.add(hqRoof);

        const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.4, 10.2), glowMat);
        neonStrip.position.set(0, 12.6, -4); parentGroup.add(neonStrip);

        const radarSupport = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3, 8), metalPlateMat);
        radarSupport.position.set(0, 15.7, -4); radarSupport.castShadow = true; parentGroup.add(radarSupport);

        const mainRadarDish = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.8, 12), metalPlateMat);
        mainRadarDish.rotation.x = Math.PI / 2;
        mainRadarDish.position.set(0, 17.5, -4);
        mainRadarDish.castShadow = true;
        parentGroup.add(mainRadarDish);
        rotatingRadars.push(mainRadarDish);
    }

    function createBases() {
        const playerBaseGroup = new THREE.Group();
        playerBaseGroup.position.set(CORNER_OFFSET, getTerrainHeight(CORNER_OFFSET, CORNER_OFFSET), CORNER_OFFSET);
        playerBaseGroup.rotation.y = -(3 * Math.PI) / 4; 

        const enemyBaseGroup = new THREE.Group();
        enemyBaseGroup.position.set(-CORNER_OFFSET, getTerrainHeight(-CORNER_OFFSET, -CORNER_OFFSET), -CORNER_OFFSET);
        enemyBaseGroup.rotation.y = -(3 * Math.PI) / 4;

        if (playerFlagType === 'green') {
            createBaseStructure(playerBaseGroup, false);
            createBaseStructure(enemyBaseGroup, true);
        } else {
            createBaseStructure(playerBaseGroup, true);
            createBaseStructure(enemyBaseGroup, false);
        }

        scene.add(playerBaseGroup);
        scene.add(enemyBaseGroup);

        obstacles.push({ x: CORNER_OFFSET, z: CORNER_OFFSET, radius: 22 });
        obstacles.push({ x: -CORNER_OFFSET, z: -CORNER_OFFSET, radius: 22 });

        let pColor = playerFlagType === 'green' ? 0x2e3b23 : 0x6b3a2a;
        let eColor = playerFlagType === 'green' ? 0x6b3a2a : 0x2e3b23;
        
        let pTankX = CORNER_OFFSET - 45;
        let pTankZ = CORNER_OFFSET - 45;
        let eTankX = -CORNER_OFFSET + 45;
        let eTankZ = -CORNER_OFFSET + 45;

        let playerTank = createTank(pTankX, pTankZ, pColor, 'player', 'normal');
        let enemyTank = createTank(eTankX, eTankZ, eColor, 'enemy', 'normal');

        playerTank.mesh.rotation.y = -Math.PI / 4;
        enemyTank.mesh.rotation.y = -Math.PI / 4;

        playerTanks.push(playerTank);
        enemyTanks.push(enemyTank);
            
        enemyPoleFlagMesh = createFlagPole(new THREE.Group(), -CORNER_OFFSET, -CORNER_OFFSET, enemyFlagType, 'enemy');
        playerPoleFlagMesh = createFlagPole(new THREE.Group(), CORNER_OFFSET, CORNER_OFFSET, playerFlagType, 'player');
    }

    function createOilRigs() {
        const positions = [
            { x: 50, z: -50 }, 
            { x: -50, z: 50 },
            { x: -70, z: -70 },
            { x: 70, z: 70 }
        ];

        positions.forEach(pos => {
            const rigGroup = new THREE.Group();
            let terrainH = getTerrainHeight(pos.x, pos.z);
            rigGroup.position.set(pos.x, terrainH, pos.z);

            const baseMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
            const base = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 12), baseMat);
            base.position.y = 1; base.castShadow = true; base.receiveShadow = true;
            rigGroup.add(base);

            const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 });
            const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), frameMat);
            leftPillar.position.set(-2.5, 5, 0); leftPillar.rotation.z = 0.15; leftPillar.castShadow = true;
            rigGroup.add(leftPillar);

            const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), frameMat);
            rightPillar.position.set(2.5, 5, 0); rightPillar.rotation.z = -0.15; rightPillar.castShadow = true;
            rigGroup.add(rightPillar);

            const topBar = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 1.2), frameMat);
            topBar.position.set(0, 9, 0); topBar.castShadow = true;
            rigGroup.add(topBar);

            const beamGroup = new THREE.Group();
            beamGroup.position.set(0, 9.4, 0);

            const walkingBeam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 14), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.3 }));
            walkingBeam.position.set(0, 0, 1); walkingBeam.castShadow = true;
            beamGroup.add(walkingBeam);

            const horseheadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
            const horsehead = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 2), horseheadMat);
            horsehead.position.set(0, -1.2, 7.5); horsehead.castShadow = true;
            beamGroup.add(horsehead);

            const weightMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
            const counterweight = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), weightMat);
            counterweight.position.set(0, -1, -5.5); counterweight.castShadow = true;
            beamGroup.add(counterweight);

            rigGroup.add(beamGroup);

            const motorBox = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial({ color: 0x334155 }));
            motorBox.position.set(0, 2.5, -5.5); motorBox.castShadow = true;
            rigGroup.add(motorBox);

            const flagGroup = new THREE.Group();
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 18, 6), new THREE.MeshStandardMaterial({color: 0x999999}));
            pole.position.set(6, 9, -4); flagGroup.add(pole);

            const flagGeo = new THREE.PlaneGeometry(7, 4, 12, 4);
            const flagMat = new THREE.MeshBasicMaterial({ map: createFlagTexture('none'), side: THREE.DoubleSide });
            const flagMesh = new THREE.Mesh(flagGeo, flagMat);
            flagMesh.position.set(9.5, 16, -4); flagGroup.add(flagMesh);
            activeFlagMeshes.push({ mesh: flagMesh, baseHeight: 16, type: 'none' });

            rigGroup.add(flagGroup);
            scene.add(rigGroup);
            
            obstacles.push({ x: pos.x, z: pos.z, radius: 10 });
            
            oilRigs.push({
                x: pos.x, z: pos.z, group: rigGroup,
                beam: beamGroup,
                flagData: activeFlagMeshes[activeFlagMeshes.length - 1],
                owner: 'none', captureProgress: 0
            });
            
            animatedRigs.push(beamGroup);
        });
    }

    function createTank(x, z, colorHex, team, type = 'normal') {
        const tankGroup = new THREE.Group();
        let isRocketTank = (type === 'rocket');
        
        let baseColor = isRocketTank ? (team === 'player' ? 0x1e3a8a : 0x7f1d1d) : colorHex;
        const armorMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.5 });
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

        const bodySizeX = isRocketTank ? 7 : 6;
        const bodySizeZ = isRocketTank ? 10 : 9;
        const body = new THREE.Mesh(new THREE.BoxGeometry(bodySizeX, 2.2, bodySizeZ), armorMat);
        body.position.y = 1.2; body.name = "body"; body.castShadow = true; body.receiveShadow = true; tankGroup.add(body);
        
        const leftTrack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, bodySizeZ + 0.2), trackMat);
        leftTrack.position.set(-(bodySizeX/2 + 0.5), 0.8, 0); leftTrack.castShadow = true; tankGroup.add(leftTrack);
        
        const rightTrack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, bodySizeZ + 0.2), trackMat);
        rightTrack.position.set((bodySizeX/2 + 0.5), 0.8, 0); rightTrack.castShadow = true; tankGroup.add(rightTrack);
        
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 1.5, 10), armorMat);
        turret.position.y = 2.8; turret.name = "turret"; turret.castShadow = true; tankGroup.add(turret);
        
        if (isRocketTank) {
            const launcherPod = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
            launcherPod.position.set(0, 3.8, 0); launcherPod.name = "launcherPod"; launcherPod.castShadow = true; tankGroup.add(launcherPod);
        } else {
            const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 6), armorMat);
            cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 2.8, 4); cannon.name = "cannon"; cannon.castShadow = true; tankGroup.add(cannon);
        }

        let terrainY = getTerrainHeight(x, z);
        tankGroup.position.set(x, terrainY, z);
        scene.add(tankGroup);

        const hpLabel = document.createElement('div');
        hpLabel.className = `tank-hp-label ${team === 'player' ? 'hp-player' : 'hp-enemy'}`;
        let initialHp = isRocketTank ? 200 : 100;
        hpLabel.innerText = `${initialHp}`;
        document.getElementById('hp-labels-container').appendChild(hpLabel);

        let idleAudio = new Audio(soundFiles.idle);
        idleAudio.loop = true;
        idleAudio.volume = 0.25;

        let moveAudio = new Audio(soundFiles.move);
        moveAudio.loop = true;
        moveAudio.volume = 0.45;

        return { 
            mesh: tankGroup, 
            hpLabel: hpLabel, 
            target: null, 
            team: team, 
            type: type, 
            hp: initialHp, 
            maxHp: initialHp, 
            lastShot: 0, 
            isDestroyed: false,
            destructionTimer: 0,
            idleAudio: idleAudio,
            moveAudio: moveAudio,
            isIdlePlaying: false,
            isMovePlaying: false,
            lastTrackPos: new THREE.Vector3(x, terrainY, z)
        };
    }

    function getRealisticTreadTexture() {
        if (treadTextureCache) return treadTextureCache;
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#261408';
        ctx.fillRect(0, 0, 64, 128);
        
        ctx.fillStyle = '#110a04';
        for (let y = 8; y < 128; y += 16) {
            ctx.fillRect(6, y, 52, 6);
            ctx.fillStyle = '#3a2211';
            ctx.fillRect(6, y + 6, 52, 2);
            ctx.fillStyle = '#110a04';
        }

        treadTextureCache = new THREE.CanvasTexture(canvas);
        treadTextureCache.wrapS = THREE.RepeatWrapping;
        treadTextureCache.wrapT = THREE.RepeatWrapping;
        treadTextureCache.repeat.set(1, 3);
        return treadTextureCache;
    }

    function spawnRealisticTankTracks(centerPos, rotationY, bodyWidth) {
        const halfWidth = bodyWidth / 2 + 0.3;
        const trackGeo = new THREE.PlaneGeometry(1.2, 3.2);
        trackGeo.rotateX(-Math.PI / 2);

        const trackMat = new THREE.MeshBasicMaterial({ 
            map: getRealisticTreadTexture(), 
            transparent: true, 
            opacity: 0.9 
        });

        const offsetX = Math.cos(rotationY) * halfWidth;
        const offsetZ = Math.sin(rotationY) * halfWidth;

        let terrainH = getTerrainHeight(centerPos.x - offsetX, centerPos.z + offsetZ);
        const leftMesh = new THREE.Mesh(trackGeo, trackMat);
        leftMesh.position.set(centerPos.x - offsetX, terrainH + 0.04, centerPos.z + offsetZ);
        leftMesh.rotation.y = rotationY;
        scene.add(leftMesh);
        tankTracks.push({ mesh: leftMesh, life: 350 });

        let terrainH2 = getTerrainHeight(centerPos.x + offsetX, centerPos.z - offsetZ);
        const rightMesh = new THREE.Mesh(trackGeo, trackMat.clone());
        rightMesh.position.set(centerPos.x + offsetX, terrainH2 + 0.04, centerPos.z - offsetZ);
        rightMesh.rotation.y = rotationY;
        scene.add(rightMesh);
        tankTracks.push({ mesh: rightMesh, life: 350 });
    }

    function updateTankAudio(tank, isMoving) {
        if (gameOver || tank.isDestroyed) {
            if (tank.isIdlePlaying) { tank.idleAudio.pause(); tank.idleAudio.currentTime = 0; tank.isIdlePlaying = false; }
            if (tank.isMovePlaying) { tank.moveAudio.pause(); tank.moveAudio.currentTime = 0; tank.isMovePlaying = false; }
            return;
        }

        if (isMoving) {
            if (tank.isIdlePlaying) { tank.idleAudio.pause(); tank.idleAudio.currentTime = 0; tank.isIdlePlaying = false; }
            if (!tank.isMovePlaying) { tank.moveAudio.play().then(() => { tank.isMovePlaying = true; }).catch(e => {}); }
        } else {
            if (tank.isMovePlaying) { tank.moveAudio.pause(); tank.moveAudio.currentTime = 0; tank.isMovePlaying = false; }
            if (!tank.isIdlePlaying) { tank.idleAudio.play().then(() => { tank.isIdlePlaying = true; }).catch(e => {}); }
        }
    }

    function addSmokeParticle(pos, customColor = 0x222222, scale = 1) {
        const geo = new THREE.SphereGeometry(0.8 * scale, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: customColor, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        let groundH = getTerrainHeight(pos.x, pos.z);
        mesh.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*2, Math.max(2, groundH + 2), (Math.random()-0.5)*2));
        scene.add(mesh);
        smokeParticles.push({ mesh: mesh, life: 35, vy: 0.12 });
    }

    function updateTanksDamageVisual(tankData) {
        let healthPercent = tankData.hp / tankData.maxHp;
        let colorHex = healthPercent > 0.6 ? null : (healthPercent > 0.3 ? 0x555555 : 0x111111);
        if (colorHex !== null) {
            tankData.mesh.traverse((child) => {
                if (child.isMesh && child.material && child.name !== "") {
                    child.material.color.setHex(colorHex);
                }
            });
        }
    }

    function buyPlayerTank(type) {
        if (playerBuildCooldown > 0) return;
        let cost = (type === 'rocket') ? 300 : 150;
        if (playerMoney >= cost) {
            playerMoney -= cost;
            totalMoneySpent += cost;
            playerBuildCooldown = 1200;
            updateEconomyUI();
            playSound('buy');
            let pColor = playerFlagType === 'green' ? 0x2e3b23 : 0x6b3a2a;
            let pX = CORNER_OFFSET - 50 + (Math.random() - 0.5) * 20;
            let pZ = CORNER_OFFSET - 50 + (Math.random() - 0.5) * 20;
            let newTank = createTank(pX, pZ, pColor, 'player', type);
            newTank.mesh.rotation.y = -Math.PI / 4;
            
            if (playerTargetPos) {
                newTank.target = playerTargetPos.clone();
            }

            playerTanks.push(newTank);
            showFloatingMsg(type === 'rocket' ? 'تم طلب دبابة صواريخ' : 'تم طلب دبابة عادية');
        }
    }

    function createFlagPole(group, x, z, flagType, role) {
        let terrainH = getTerrainHeight(x, z);
        group.position.set(x, terrainH, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 35, 8), new THREE.MeshStandardMaterial({ color: 0xd1d5db }));
        pole.position.set(16, 17.5, 0); pole.castShadow = true; group.add(pole);

        const flagGeo = new THREE.PlaneGeometry(10, 6, 14, 4);
        const flagMat = new THREE.MeshBasicMaterial({ map: createFlagTexture(flagType), side: THREE.DoubleSide });
        const flagMesh = new THREE.Mesh(flagGeo, flagMat);
        flagMesh.position.set(21, 38.5, 0);
        group.add(flagMesh);

        let flagDataObj = { mesh: flagMesh, baseHeight: 38.5, type: flagType };
        activeFlagMeshes.push(flagDataObj);

        if (role === 'enemy') enemyFlagDataRef = flagDataObj;
        else playerFlagDataRef = flagDataObj;

        scene.add(group);
        return flagMesh;
    }

    function createFlagTexture(type) {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (type === 'green') {
            ctx.fillStyle = '#007a3d'; ctx.fillRect(0, 0, 128, 21);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 21, 128, 22);
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 43, 128, 21);
            drawStar(ctx, 42, 32, '#cc0000'); drawStar(ctx, 64, 32, '#cc0000'); drawStar(ctx, 85, 32, '#cc0000');
        } else if(type === 'red') {
            ctx.fillStyle = '#cc0000'; ctx.fillRect(0, 0, 128, 21);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 21, 128, 22);
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 43, 128, 21);
            drawStar(ctx, 50, 32, '#007a3d'); drawStar(ctx, 78, 32, '#007a3d');
        } else {
            ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0, 0, 128, 64);
            ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('محايد', 64, 36);
        }
        return new THREE.CanvasTexture(canvas);
    }

    function drawStar(ctx, cx, cy, color) {
        let rot = Math.PI / 2 * 3; let step = Math.PI / 5;
        ctx.beginPath(); ctx.moveTo(cx, cy - 8);
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(cx + Math.cos(rot) * 8, cy + Math.sin(rot) * 8); rot += step;
            ctx.lineTo(cx + Math.cos(rot) * 3.5, cy + Math.sin(rot) * 3.5); rot += step;
        }
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }

    function animateFlags() {
        flagWaveTime += 0.15;
        rotatingRadars.forEach(radar => { radar.rotation.y += 0.025; });

        activeFlagMeshes.forEach(item => {
            const positions = item.mesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                let u = positions.getX(i);
                let v = positions.getY(i);
                if (u > -4.8) {
                    let distanceFactor = (u + 5) / 10;
                    let wave = Math.sin(flagWaveTime * 2.5 - u * 1.2) * 0.7 * distanceFactor;
                    let secondaryWave = Math.cos(flagWaveTime * 4 - v * 0.8) * 0.3 * distanceFactor;
                    positions.setZ(i, wave + secondaryWave);
                }
            }
            positions.needsUpdate = true;
        });
    }

    function createTargetMarker() {
        const geo = new THREE.RingGeometry(1, 2, 16); geo.rotateX(-Math.PI / 2);
        targetMarkerMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
        targetMarkerMesh.visible = false;
        scene.add(targetMarkerMesh);
    }

    function updateCameraPosition() {
        cameraRadius = THREE.MathUtils.lerp(cameraRadius, targetCameraRadius, 0.15);
        let shakeX = 0, shakeY = 0;
        if (shakeTimer > 0) {
            shakeTimer--;
            shakeX = (Math.random() - 0.5) * shakeIntensity;
            shakeY = (Math.random() - 0.5) * shakeIntensity;
        }
        if (isCinematicEnding && cinematicTargetLook) {
            targetLookAt.lerp(cinematicTargetLook, 0.05);
            cameraRadius = THREE.MathUtils.lerp(cameraRadius, 70, 0.05);
            cameraTheta += 0.01;
        }
        camera.position.x = targetLookAt.x + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta) + shakeX;
        camera.position.y = targetLookAt.y + cameraRadius * Math.cos(cameraPhi) + shakeY;
        camera.position.z = targetLookAt.z + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
        camera.lookAt(targetLookAt);
    }

    function triggerCameraShake(intensity = 1.8) {
        shakeTimer = 18;
        shakeIntensity = intensity;
    }

    function setupInteraction() {
        const dom = renderer.domElement;
        dom.addEventListener('pointerdown', (e) => {
            if (gameOver || isCinematicEnding) return;
            isDragging = true;
            hasMoved = false;
            previousTouchX = e.clientX;
            previousTouchY = e.clientY;
            touchStartX = e.clientX;
            touchStartY = e.clientY;
        });

        dom.addEventListener('pointermove', (e) => {
            if (!isDragging || gameOver || isCinematicEnding) return;
            const deltaX = e.clientX - previousTouchX;
            const deltaY = e.clientY - previousTouchY;
            if (Math.abs(e.clientX - touchStartX) > 5 || Math.abs(e.clientY - touchStartY) > 5) {
                hasMoved = true;
            }
            if (hasMoved) {
                cameraTheta -= deltaX * 0.008;
                cameraPhi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, cameraPhi - deltaY * 0.008));
            }
            previousTouchX = e.clientX;
            previousTouchY = e.clientY;
        });

        dom.addEventListener('pointerup', (e) => {
            if (gameOver || isCinematicEnding) return;
            isDragging = false;
            if (!hasMoved) {
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);

                if (selectionMode === 'single') {
                    let tankObjects = playerTanks.map(t => t.mesh);
                    let intersects = raycaster.intersectObjects(tankObjects, true);
                    if (intersects.length > 0) {
                        let hitMesh = intersects[0].object;
                        let found = playerTanks.find(t => t.mesh === hitMesh || t.mesh.children.includes(hitMesh));
                        if (found && !found.isDestroyed) {
                            selectedTank = found;
                            showFloatingMsg('تم تحديد الدبابة');
                            return;
                        }
                    }
                }

                const intersects = raycaster.intersectObject(terrainMesh);
                if (intersects.length > 0) {
                    playerTargetPos = intersects[0].point;
                    targetMarkerMesh.position.copy(playerTargetPos);
                    targetMarkerMesh.position.y = getTerrainHeight(playerTargetPos.x, playerTargetPos.z) + 0.1;
                    targetMarkerMesh.visible = true;

                    if (selectionMode === 'all') {
                        playerTanks.forEach((t, index) => {
                            if (t.isDestroyed) return;
                            let offset = new THREE.Vector3((index%3)*8 - 8, 0, Math.floor(index/3)*8);
                            t.target = playerTargetPos.clone().add(offset);
                        });
                    } else if (selectedTank && !selectedTank.isDestroyed) {
                        selectedTank.target = playerTargetPos.clone();
                    }
                }
            }
        });

        dom.addEventListener('wheel', (e) => { 
            if(!isCinematicEnding) targetCameraRadius = Math.max(50, Math.min(550, targetCameraRadius + e.deltaY * 0.3)); 
        }, { passive: true });
    }

    function setupMinimapInteraction() {
        const minimap = document.getElementById('minimap-container');
        minimap.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const rect = minimap.getBoundingClientRect();
            const xClick = e.clientX - rect.left;
            const yClick = e.clientY - rect.top;
            
            const normX = (xClick / rect.width - 0.5) * 2;
            const normZ = (yClick / rect.height - 0.5) * 2;
            
            let worldX = normX * MAP_LIMIT;
            let worldZ = normZ * MAP_LIMIT;
            
            targetLookAt.x = worldX;
            targetLookAt.z = worldZ;
            showFloatingMsg('تم نقل الكاميرا عبر الخريطة المصغرة');
        });
    }

    function renderMinimap() {
        const canvas = document.getElementById('minimap-canvas');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(w/2, h/2, w/2, 0, Math.PI * 2);
        ctx.fill();
        
        const scale = (w / 2) / MAP_LIMIT;

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(w/2 + CORNER_OFFSET * scale - 3, h/2 + CORNER_OFFSET * scale - 3, 6, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(w/2 + (-CORNER_OFFSET) * scale - 3, h/2 + (-CORNER_OFFSET) * scale - 3, 6, 6);

        playerTanks.forEach(t => {
            if (t.isDestroyed) return;
            let mx = w/2 + t.mesh.position.x * scale;
            let mz = h/2 + t.mesh.position.z * scale;
            ctx.fillStyle = '#22c55e';
            ctx.beginPath(); ctx.arc(mx, mz, 2.5, 0, Math.PI*2); ctx.fill();
        });

        enemyTanks.forEach(t => {
            if (t.isDestroyed) return;
            let mx = w/2 + t.mesh.position.x * scale;
            let mz = h/2 + t.mesh.position.z * scale;
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(mx, mz, 2.5, 0, Math.PI*2); ctx.fill();
        });

        let camMx = w/2 + targetLookAt.x * scale;
        let camMz = h/2 + targetLookAt.z * scale;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(camMx, camMz, 6, 0, Math.PI*2); ctx.stroke();
    }

    function getSmartMovementVector(currentPos, desiredDir, currentTank) {
        let bestDir = desiredDir.clone().normalize();
        let testPos = currentPos.clone().add(bestDir.clone().multiplyScalar(0.35));
        if (isPositionSafe(testPos, currentTank)) return bestDir;

        let angles = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI / 2, -Math.PI / 2];
        for (let angle of angles) {
            let rotatedDir = desiredDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
            let altTestPos = currentPos.clone().add(rotatedDir.multiplyScalar(0.35));
            if (isPositionSafe(altTestPos, currentTank)) return rotatedDir;
        }
        return null;
    }

    function isPositionSafe(nextPos, currentTank) {
        if (Math.abs(nextPos.x) > MAP_LIMIT || Math.abs(nextPos.z) > MAP_LIMIT) return false;

        for (let obs of obstacles) {
            let dx = nextPos.x - obs.x; 
            let dz = nextPos.z - obs.z;
            if (Math.sqrt(dx * dx + dz * dz) < obs.radius + TANK_RADIUS) return false;
        }

        let allTanks = [...playerTanks, ...enemyTanks];
        for (let other of allTanks) {
            if (other === currentTank || other.isDestroyed) continue;
            let dx = nextPos.x - other.mesh.position.x;
            let dz = nextPos.z - other.mesh.position.z;
            if (Math.sqrt(dx * dx + dz * dz) < TANK_RADIUS * 2.2) return false;
        }
        return true;
    }

    function fireBullet(fromTank, targetTank) {
        const now = Date.now();
        if (now - fromTank.lastShot < 1200) return;
        fromTank.lastShot = now;
        
        playSound('shoot', fromTank.team === 'player' ? 1.0 : 0.4);
        if (fromTank.team === 'player') {
            playSound('attack', 0.8);
            triggerCameraShake(1.2);
        } else {
            playSound('danger', 0.8);
        }

        const bulletMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
        bulletMesh.position.copy(fromTank.mesh.position).add(new THREE.Vector3(0, 3, 0));
        scene.add(bulletMesh);
        bullets.push({ mesh: bulletMesh, fromTank: fromTank, fromTeam: fromTank.team, targetTank: targetTank, speed: 2.2, damage: 34 });
    }

    function fireTacticalMissile(fromTank, targetTank) {
        const now = Date.now();
        if (now - fromTank.lastShot < 3500) return;
        fromTank.lastShot = now;

        playSound('rocket', fromTank.team === 'player' ? 1.0 : 0.5);
        if (fromTank.team === 'player') {
            playSound('attack', 0.9);
            triggerCameraShake(2.5);
        } else {
            playSound('danger', 0.9);
        }

        const missileGeo = new THREE.ConeGeometry(0.4, 2.5, 6);
        missileGeo.rotateX(Math.PI / 2);
        const missileMesh = new THREE.Mesh(missileGeo, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        let startPos = fromTank.mesh.position.clone().add(new THREE.Vector3(0, 4, 0));
        missileMesh.position.copy(startPos);
        scene.add(missileMesh);

        let targetPos = targetTank.mesh.position.clone();

        tacticalMissiles.push({
            mesh: missileMesh, 
            fromTeam: fromTank.team, 
            targetTank: targetTank,
            startPos: startPos, 
            targetPos: targetPos,
            progress: 0,
            totalDuration: 75
        });
    }

    function createShockwaveAndExplosion(centerPos, fromTeam) {
        playSound('explosion');
        const ringGeo = new THREE.RingGeometry(0.5, 1, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6600, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(centerPos); 
        ringMesh.position.y = getTerrainHeight(centerPos.x, centerPos.z) + 0.2;
        scene.add(ringMesh);

        const beamGeo = new THREE.CylinderGeometry(3, 8, 1, 16, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.copy(centerPos); 
        beamMesh.position.y = getTerrainHeight(centerPos.x, centerPos.z) + 5;
        scene.add(beamMesh);

        shockwaves.push({ ring: ringMesh, beam: beamMesh, life: 25, scaleSpeed: 1.4 });
        for (let i = 0; i < 8; i++) addSmokeParticle(centerPos, 0xff4500, 1.8);

        let allTanks = [...playerTanks, ...enemyTanks];
        allTanks.forEach(tank => {
            if (tank.isDestroyed) return;
            let dist = tank.mesh.position.distanceTo(centerPos);
            if (dist < 28) {
                let damageAmount = Math.floor(110 * (1 - dist / 28));
                tank.hp -= Math.max(30, damageAmount);
                updateTanksDamageVisual(tank);
                if (tank.hp <= 0 && !tank.isDestroyed) {
                    tank.isDestroyed = true;
                    tank.target = null;
                    updateTankAudio(tank, false);
                    if (fromTeam === 'player' && tank.team === 'enemy') enemyTanksLost++;
                    else if (fromTeam === 'enemy' && tank.team === 'player') totalTanksLost++;
                }
            }
        });
    }

    function updateTankHpLabels() {
        const tempV = new THREE.Vector3();
        const allTanks = [...playerTanks, ...enemyTanks];
        allTanks.forEach(tank => {
            if (tank.isDestroyed) { tank.hpLabel.style.display = 'none'; return; }
            tank.hpLabel.style.display = 'block';
            tank.mesh.getWorldPosition(tempV);
            tempV.y += (3.8 * tank.mesh.scale.y); 
            tempV.project(camera);
            if (tempV.z > 1) { tank.hpLabel.style.display = 'none'; return; }
            const x = (tempV.x * .5 + .5) * window.innerWidth;
            const y = (-(tempV.y * .5) + .5) * window.innerHeight;
            tank.hpLabel.style.left = `${x}px`;
            tank.hpLabel.style.top = `${y}px`;
            tank.hpLabel.innerText = `${tank.hp}`;
        });
    }

    function updateTanksMovement() {
        if (gameOver) return;

        if (playerBuildCooldown > 0) { playerBuildCooldown--; updateEconomyUI(); }
        if (enemyBuildCooldown > 0) enemyBuildCooldown--;

        for (let i = tankTracks.length - 1; i >= 0; i--) {
            let tr = tankTracks[i];
            tr.life--;
            if (tr.life < 100) tr.mesh.material.opacity = (tr.life / 100) * 0.9;
            if (tr.life <= 0) {
                scene.remove(tr.mesh);
                tr.mesh.geometry.dispose();
                tr.mesh.material.dispose();
                tankTracks.splice(i, 1);
            }
        }

        for (let i = smokeParticles.length - 1; i >= 0; i--) {
            let p = smokeParticles[i];
            p.life--; p.mesh.position.y += p.vy; p.mesh.scale.multiplyScalar(1.03); p.mesh.material.opacity -= 0.025;
            if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); smokeParticles.splice(i, 1); }
        }

        for (let i = shockwaves.length - 1; i >= 0; i--) {
            let sw = shockwaves[i];
            sw.life--;
            sw.ring.scale.addScalar(sw.scaleSpeed);
            sw.ring.material.opacity -= 0.04;
            sw.beam.scale.y += 0.8;
            sw.beam.material.opacity -= 0.04;
            if (sw.life <= 0) {
                scene.remove(sw.ring); sw.ring.geometry.dispose(); sw.ring.material.dispose();
                scene.remove(sw.beam); sw.beam.geometry.dispose(); sw.beam.material.dispose();
                shockwaves.splice(i, 1);
            }
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            if (!b.targetTank || !b.targetTank.mesh.parent || b.targetTank.isDestroyed) {
                scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bullets.splice(i, 1);
                continue;
            }
            let dir = new THREE.Vector3().subVectors(b.targetTank.mesh.position, b.mesh.position);
            if (dir.length() < 2.5) {
                b.targetTank.hp -= b.damage;
                playSound('explosion');
                addSmokeParticle(b.targetTank.mesh.position);
                updateTanksDamageVisual(b.targetTank);
                if (b.targetTank.hp <= 0 && !b.targetTank.isDestroyed) {
                    b.targetTank.isDestroyed = true;
                    b.targetTank.target = null;
                    updateTankAudio(b.targetTank, false);
                    if (b.fromTeam === 'player') totalTanksLost++;
                    else enemyTanksLost++;
                }
                scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bullets.splice(i, 1);
            } else {
                b.mesh.position.add(dir.normalize().multiplyScalar(b.speed));
            }
        }

        for (let i = tacticalMissiles.length - 1; i >= 0; i--) {
            let m = tacticalMissiles[i];
            if (m.targetTank && !m.targetTank.isDestroyed) m.targetPos.copy(m.targetTank.mesh.position);

            m.progress++;
            let t = m.progress / m.totalDuration;

            if (t >= 1.0) {
                createShockwaveAndExplosion(m.targetPos, m.fromTeam);
                if (m.fromTeam === 'player') triggerCameraShake(2.2);
                scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
                tacticalMissiles.splice(i, 1);
            } else {
                let currentPos = new THREE.Vector3().lerpVectors(m.startPos, m.targetPos, t);
                let arcHeight = Math.sin(t * Math.PI) * 45;
                currentPos.y += arcHeight;
                m.mesh.position.copy(currentPos);
                addSmokeParticle(m.mesh.position, 0xdddddd, 1.0);
            }
        }

        let allTanksCombined = [...playerTanks, ...enemyTanks];
        allTanksCombined.forEach(tankData => {
            if (tankData.isDestroyed) {
                tankData.destructionTimer++;
                if (tankData.destructionTimer <= 600) {
                    if (tankData.destructionTimer % 15 === 0) addSmokeParticle(tankData.mesh.position, 0x111111, 1.5);
                } else {
                    tankData.mesh.visible = false;
                    tankData.hpLabel.remove();
                }
                updateTankAudio(tankData, false);
                return;
            }

            let isMoving = false;
            let enemyTarget = enemyTanks.find(e => !e.isDestroyed && e.mesh.position.distanceTo(tankData.mesh.position) < (tankData.type === 'rocket' ? 140 : 110));

            if (tankData.team === 'enemy') {
                enemyTarget = playerTanks.find(p => !p.isDestroyed && p.mesh.position.distanceTo(tankData.mesh.position) < (tankData.type === 'rocket' ? 140 : 110));
            }

            if (tankData.type === 'rocket' && enemyTarget) {
                let distToTarget = tankData.mesh.position.distanceTo(enemyTarget.mesh.position);
                if (distToTarget < 60) {
                    let retreatDir = new THREE.Vector3().subVectors(tankData.mesh.position, enemyTarget.mesh.position).setY(0).normalize();
                    let safeDir = getSmartMovementVector(tankData.mesh.position, retreatDir, tankData);
                    if (safeDir) {
                        let nextPos = tankData.mesh.position.clone().add(safeDir.multiplyScalar(0.3));
                        nextPos.y = getTerrainHeight(nextPos.x, nextPos.z);
                        tankData.mesh.position.copy(nextPos); 
                        isMoving = true;
                    }
                } else if (distToTarget > 110) {
                    let dir = new THREE.Vector3().subVectors(enemyTarget.mesh.position, tankData.mesh.position).setY(0).normalize();
                    let safeDir = getSmartMovementVector(tankData.mesh.position, dir, tankData);
                    if (safeDir) {
                        let nextPos = tankData.mesh.position.clone().add(safeDir.multiplyScalar(0.35));
                        nextPos.y = getTerrainHeight(nextPos.x, nextPos.z);
                        tankData.mesh.position.copy(nextPos); 
                        isMoving = true;
                    }
                }
                fireTacticalMissile(tankData, enemyTarget);
            } else {
                if (tankData.team === 'player') {
                    if (tankData.target) {
                        const dist = tankData.mesh.position.distanceTo(tankData.target);
                        if (dist > 1.5) {
                            const desiredDir = new THREE.Vector3().subVectors(tankData.target, tankData.mesh.position).setY(0).normalize();
                            let safeDir = getSmartMovementVector(tankData.mesh.position, desiredDir, tankData);
                            if (safeDir) {
                                isMoving = true;
                                tankData.mesh.rotation.y += (Math.atan2(safeDir.x, safeDir.z) - tankData.mesh.rotation.y) * 0.15;
                                let nextPos = tankData.mesh.position.clone().add(safeDir.multiplyScalar(0.35));
                                nextPos.y = getTerrainHeight(nextPos.x, nextPos.z);
                                tankData.mesh.position.copy(nextPos);
                            }
                        } else {
                            if (tankData.target === playerTargetPos) targetMarkerMesh.visible = false;
                            tankData.target = null; 
                        }
                    }
                } else {
                    if (!tankData.target || Math.random() < 0.01) {
                        tankData.target = new THREE.Vector3(CORNER_OFFSET + (Math.random() - 0.5) * 40, 0, CORNER_OFFSET + (Math.random() - 0.5) * 40);
                        tankData.target.y = getTerrainHeight(tankData.target.x, tankData.target.z);
                    }
                    const dist = tankData.mesh.position.distanceTo(tankData.target);
                    if (dist > 1.5) {
                        const desiredDir = new THREE.Vector3().subVectors(tankData.target, tankData.mesh.position).setY(0).normalize();
                        let safeDir = getSmartMovementVector(tankData.mesh.position, desiredDir, tankData);
                        if (safeDir) {
                            isMoving = true;
                            tankData.mesh.rotation.y += (Math.atan2(safeDir.x, safeDir.z) - tankData.mesh.rotation.y) * 0.15;
                            let nextPos = tankData.mesh.position.clone().add(safeDir.multiplyScalar(0.32));
                            nextPos.y = getTerrainHeight(nextPos.x, nextPos.z);
                            tankData.mesh.position.copy(nextPos);
                        }
                    }
                }
                if (enemyTarget) fireBullet(tankData, enemyTarget);
            }

            if (isMoving) {
                if (tankData.mesh.position.distanceTo(tankData.lastTrackPos) > 2.8) {
                    let bodyWidth = tankData.type === 'rocket' ? 7 : 6;
                    spawnRealisticTankTracks(tankData.mesh.position, tankData.mesh.rotation.y, bodyWidth);
                    tankData.lastTrackPos.copy(tankData.mesh.position);
                }
            }

            updateTankAudio(tankData, isMoving);
        });

        if (enemyMoney >= 150 && enemyBuildCooldown === 0 && enemyTanks.filter(t => !t.isDestroyed).length < 5) {
            let buyType = (enemyMoney >= 300 && Math.random() > 0.5) ? 'rocket' : 'normal';
            let cost = (buyType === 'rocket') ? 300 : 150;
            if (enemyMoney >= cost) {
                enemyMoney -= cost;
                enemyBuildCooldown = 1200; 
                let eColor = playerFlagType === 'green' ? 0x6b3a2a : 0x2e3b23;
                let eX = -CORNER_OFFSET + 50 + (Math.random() - 0.5) * 20;
                let eZ = -CORNER_OFFSET + 50 + (Math.random() - 0.5) * 20;
                let newEnemyTank = createTank(eX, eZ, eColor, 'enemy', buyType);
                newEnemyTank.mesh.rotation.y = -Math.PI / 4;
                enemyTanks.push(newEnemyTank);
            }
        }

        updateTankHpLabels();
    }

    function updateEconomyUI() {
        document.getElementById('money-display').innerText = playerMoney;
        let buyBtn = document.getElementById('buy-tank-btn');
        let rocketBtn = document.getElementById('buy-rocket-tank-btn');

        if (playerBuildCooldown > 0) {
            let secs = Math.ceil(playerBuildCooldown / 60);
            buyBtn.innerText = `انتظار (${secs}ث)`;
            rocketBtn.innerText = `انتظار (${secs}ث)`;
            buyBtn.disabled = true;
            rocketBtn.disabled = true;
        } else {
            buyBtn.innerText = `عادية (150$)`;
            rocketBtn.innerText = `صاروخية (300$)`;
            buyBtn.disabled = (playerMoney < 150);
            rocketBtn.disabled = (playerMoney < 300);
        }
    }

    function checkLogicAndEconomy() {
        if (gameOver) return;
        gameTick++;
        if (gameTick % 60 === 0) {
            let pIncome = 0, eIncome = 0;
            oilRigs.forEach(rig => {
                if (rig.owner === 'player') pIncome += 10;
                else if (rig.owner === 'enemy') eIncome += 10;
            });
            if (pIncome > 0) { playerMoney += pIncome; updateEconomyUI(); }
            if (eIncome > 0) enemyMoney += eIncome;
        }

        oilRigs.forEach(rig => {
            let playerNear = playerTanks.some(t => !t.isDestroyed && t.mesh.position.distanceTo(new THREE.Vector3(rig.x, getTerrainHeight(rig.x, rig.z), rig.z)) < 22);
            let enemyNear = enemyTanks.some(t => !t.isDestroyed && t.mesh.position.distanceTo(new THREE.Vector3(rig.x, getTerrainHeight(rig.x, rig.z), rig.z)) < 22);

            if (playerNear && !enemyNear && rig.owner !== 'player') {
                rig.captureProgress += 1.5;
                if (rig.captureProgress >= 100) {
                    rig.owner = 'player';
                    rig.flagData.mesh.material.map = createFlagTexture(playerFlagType);
                    rig.flagData.type = playerFlagType;
                    showFloatingMsg('تمت السيطرة على بئر النفط!');
                }
            } else if (enemyNear && !playerNear && rig.owner !== 'enemy') {
                rig.captureProgress -= 1.5;
                if (rig.captureProgress <= -100) {
                    rig.owner = 'enemy';
                    rig.flagData.mesh.material.map = createFlagTexture(enemyFlagType);
                    rig.flagData.type = enemyFlagType;
                }
            }
        });

        const enemyBasePos = new THREE.Vector3(-CORNER_OFFSET, getTerrainHeight(-CORNER_OFFSET, -CORNER_OFFSET), -CORNER_OFFSET);
        const playerBasePos = new THREE.Vector3(CORNER_OFFSET, getTerrainHeight(CORNER_OFFSET, CORNER_OFFSET), CORNER_OFFSET);

        let playerAtEnemyBase = playerTanks.some(t => !t.isDestroyed && t.mesh.position.distanceTo(enemyBasePos) < CAPTURE_RADIUS);
        let enemyAtPlayerBase = enemyTanks.some(t => !t.isDestroyed && t.mesh.position.distanceTo(playerBasePos) < CAPTURE_RADIUS);
        
        const captureText = document.getElementById('capture-status-text');
        const captureFill = document.getElementById('capture-bar-fill');

        if (playerAtEnemyBase) {
            captureProgress += 0.3;
            captureText.innerText = `السيطرة على العدو: ${Math.floor(captureProgress)}%`;
            captureFill.style.width = `${Math.min(100, captureProgress)}%`;
            captureFill.style.backgroundColor = '#22c55e';
            
            if (enemyFlagDataRef) {
                enemyFlagHeight = THREE.MathUtils.lerp(38.5, 5, captureProgress / 100);
                enemyPoleFlagMesh.position.y = enemyFlagHeight;
            }
            if (captureProgress >= 100) {
                if (enemyFlagDataRef) {
                    enemyFlagDataRef.mesh.material.map = createFlagTexture(playerFlagType);
                    enemyFlagDataRef.mesh.material.needsUpdate = true;
                    enemyPoleFlagMesh.position.y = 38.5;
                }
                startCinematicEnding(true);
            }
        } else if (captureProgress > 0 && captureProgress < 100 && !enemyAtPlayerBase) {
            captureProgress -= 0.1;
            captureFill.style.width = `${captureProgress}%`;
            if (enemyFlagDataRef) {
                enemyFlagHeight = THREE.MathUtils.lerp(38.5, 5, captureProgress / 100);
                enemyPoleFlagMesh.position.y = enemyFlagHeight;
            }
        }

        if (enemyAtPlayerBase) {
            enemyCaptureProgress += 0.25;
            captureText.innerText = `اختراق معسكرك: ${Math.floor(enemyCaptureProgress)}%`;
            captureFill.style.width = `${Math.min(100, enemyCaptureProgress)}%`;
            captureFill.style.backgroundColor = '#ef4444';

            if (playerFlagDataRef) {
                playerFlagHeight = THREE.MathUtils.lerp(38.5, 5, enemyCaptureProgress / 100);
                playerPoleFlagMesh.position.y = playerFlagHeight;
            }
            if (enemyCaptureProgress >= 100) {
                if (playerFlagDataRef) {
                    playerFlagDataRef.mesh.material.map = createFlagTexture(enemyFlagType);
                    playerFlagDataRef.mesh.material.needsUpdate = true;
                    playerPoleFlagMesh.position.y = 38.5;
                }
                startCinematicEnding(false);
            }
        } else if (enemyCaptureProgress > 0 && enemyCaptureProgress < 100 && !playerAtEnemyBase) {
            enemyCaptureProgress -= 0.1;
            captureFill.style.width = `${enemyCaptureProgress}%`;
            captureFill.style.backgroundColor = '#22c55e';
            if (playerFlagDataRef) {
                playerFlagHeight = THREE.MathUtils.lerp(38.5, 5, enemyCaptureProgress / 100);
                playerPoleFlagMesh.position.y = playerFlagHeight;
            }
        }
    }

    function startCinematicEnding(isPlayerWinner) {
        gameOver = true;
        isCinematicEnding = true;
        
        battleBgmAudio.pause();
        battleBgmAudio.currentTime = 0;

        [...playerTanks, ...enemyTanks].forEach(t => updateTankAudio(t, false));
        document.getElementById('ui-overlay').style.display = 'none';

        if (isPlayerWinner) playSound('victory', 1.0);
        else playSound('defeat', 1.0);

        cinematicTargetLook = isPlayerWinner ? new THREE.Vector3(-CORNER_OFFSET, getTerrainHeight(-CORNER_OFFSET, -CORNER_OFFSET) + 15, -CORNER_OFFSET) : new THREE.Vector3(CORNER_OFFSET, getTerrainHeight(CORNER_OFFSET, CORNER_OFFSET) + 15, CORNER_OFFSET);

        setTimeout(() => { triggerVictoryScreen(isPlayerWinner); }, 3000);
    }

    function triggerVictoryScreen(isPlayerWinner) {
        const screen = document.getElementById('victory-screen');
        const title = document.getElementById('victory-title');
        const statsBox = document.getElementById('stats-content');
        screen.style.display = 'flex';

        let winningFlag = isPlayerWinner ? playerFlagType : enemyFlagType;
        if (isPlayerWinner) {
            title.innerText = "انتصار ساحق! 🚩"; title.style.color = "#22c55e";
        } else {
            title.innerText = "هزيمة قاسية! ⚠️ لقد سيطر العدو على معسكرك!"; title.style.color = "#ef4444";
        }

        let activePlayerTanks = playerTanks.filter(t => !t.isDestroyed).length;
        statsBox.innerHTML = `
            • العلم المنتصر: ${winningFlag === 'green' ? 'الأخضر (3 نجوم)' : 'الأحمر (نجمتان)'}<br>
            • خسائر دباباتك: ${totalTanksLost}<br>
            • دبابات العدو المدمرة: ${enemyTanksLost}<br>
            • إجمالي المال المصروف: ${totalMoneySpent}$<br>
            • الدبابات الحية المتبقية: ${activePlayerTanks}
        `;
        renderVictoryFlagCanvas(winningFlag);
    }

    function renderVictoryFlagCanvas(flagType) {
        const canvas = document.getElementById('victory-flag-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 180; canvas.height = 100;
        if (flagType === 'green') {
            ctx.fillStyle = '#007a3d'; ctx.fillRect(0, 0, 180, 33);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 33, 180, 34);
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 67, 180, 33);
            drawStar(ctx, 50, 50, '#cc0000'); drawStar(ctx, 90, 50, '#cc0000'); drawStar(ctx, 130, 50, '#cc0000');
        } else {
            ctx.fillStyle = '#cc0000'; ctx.fillRect(0, 0, 180, 33);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 33, 180, 34);
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 67, 180, 33);
            drawStar(ctx, 70, 50, '#007a3d'); drawStar(ctx, 110, 50, '#007a3d');
        }
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        processCameraInputs();
        updateCameraPosition();
        updateTanksMovement();
        checkLogicAndEconomy();
        animateFlags();
        renderMinimap();
        
        let time = Date.now() * 0.003;
        animatedRigs.forEach((beam, index) => {
            beam.rotation.x = Math.sin(time + index) * 0.35;
        });

        renderer.render(scene, camera);
    }

    window.onload = init;
</script>
</body>
</html>
