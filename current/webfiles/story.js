/* ========================================================= */
/* Generated page JavaScript                                  */
/* The original script order has been preserved.             */
/* ========================================================= */


        (function() {
            'use strict';

            /* ========== PER-PAGE CONFIG ========== */
            // Each story.html sets window.STORY_CONFIG *before* loading this
            // script. Fall back to Bloodhound defaults if a page forgets.
            const CONFIG = window.STORY_CONFIG || {};
            const STORY_FILE     = CONFIG.file          || 'bloodhound story scenes-WIP.txt';
            const STORY_TITLE    = CONFIG.title         || 'Bloodhound';
            const STORAGE_PREFIX = CONFIG.storagePrefix || 'bloodhoundReader';
            const SERVER_GATE_HASH = (CONFIG.serverGateHash || '').toLowerCase().trim();
            const SERVER_GATE_SESSION_KEY = `${STORAGE_PREFIX}.serverUnlocked.v1`;

            const PAUSE_BASE_MS = 500;
            const AUTOPLAY_DELAY_SEC = 2;
            const CHUNK_MAX_LEN = 320;

            // Blank-line counts used when stitching wider scopes together.
            // Each "blank line" from the parser is a pause chunk, but because
            // chunkText collapses consecutive blanks into a single pause, N
            // blank lines between scenes == 1 pause chunk. We want ~2 pause
            // chunks between scenes (a long beat) so we use 4 blank lines.
            const SCENE_GAP_BLANK_LINES = 4;

            // ── Cutoff / Resume markers ──
            // CUTOFF_MARKER: parsing stops at the first line whose trimmed
            // content equals this marker (unless the user enables "Ignore
            // cutoff marker" in Settings).
            // RESUME_MARKER: parsing always continues from here onwards.
            // Both marker lines are stripped from all rendered, copied, and
            // spoken output.
            const CUTOFF_MARKER = CONFIG.cutoffMarker || '////';
            const RESUME_MARKER = CONFIG.resumeMarker || '\\\\';

            const STORAGE_KEYS = {
                preferences: `${STORAGE_PREFIX}.preferences.v2`,
                progress:    `${STORAGE_PREFIX}.progress.v1`,
                storyCache:  `${STORAGE_PREFIX}.storyCache.v1`
            };

            // Divider markers live in the content string using a sentinel so
            // the renderer can turn them into styled <div>s while TTS/copy
            // never reads them out.
            const DIVIDER_MARK_PREFIX = '\u0001DIVIDER\u0001';

            let pendingResumeProgress = null;
            let currentStoryFingerprint = '';
            let currentStorySource = '';

            const volumeSelect = document.getElementById('volume-select');
            const episodeSelect = document.getElementById('episode-select');
            const sceneSelect = document.getElementById('scene-select');
            const wholeEpisodeToggle = document.getElementById('whole-episode-toggle');
            const wholeVolumeToggle = document.getElementById('whole-volume-toggle');
            const wholeSeriesToggle = document.getElementById('whole-series-toggle');
            const contentArea = document.getElementById('content-area');
            const statusEl = document.getElementById('status');
            const debugInfo = document.getElementById('debug-info');
            const debugToggle = document.getElementById('debug-toggle');
            const fileLoadArea = document.getElementById('fileLoadArea');
            const fileInput = document.getElementById('fileInput');

            const speakBtn = document.getElementById('speak-btn');
            const pauseBtn = document.getElementById('pause-btn');
            const prevBtn = document.getElementById('prev-btn');
            const replayBtn = document.getElementById('replay-btn');
            const nextBtn = document.getElementById('next-btn');
            const stopBtn = document.getElementById('stop-btn');
            const autoplayBtn = document.getElementById('autoplay-btn');
            const helpBtn = document.getElementById('help-btn');
            const settingsBtn = document.getElementById('settings-btn');
            const focusBtn = document.getElementById('focus-btn');
            const resumeBanner = document.getElementById('resume-banner');
            const clearProgressBtn = document.getElementById('clear-progress-btn');
            const voiceSelect = document.getElementById('voice-select'); // legacy; may not exist
            const chunkCounter = document.getElementById('chunk-counter');
            const chunkPanel = document.getElementById('chunk-panel');
            const chunkPanelText = document.getElementById('chunk-panel-text');
            const speedSlider = document.getElementById('speed-slider');       // legacy; may not exist
            const speedReadout = document.getElementById('speed-readout');     // legacy; may not exist

            const autoplayTimer = document.getElementById('autoplayTimer');
            const timerCountdown = document.getElementById('timerCountdown');
            const cancelAutoplayBtn = document.getElementById('cancelAutoplayBtn');

            const scenePrevBtn = document.getElementById('scene-prev-btn');
            const sceneNextBtn = document.getElementById('scene-next-btn');
            const sceneNavSpacer = document.getElementById('scene-nav-spacer');
            const scenePrevBtnBottom = document.getElementById('scene-prev-btn-bottom');
            const sceneNextBtnBottom = document.getElementById('scene-next-btn-bottom');
            const sceneNavSpacerBottom = document.getElementById('scene-nav-spacer-bottom');
            const copySceneBtn = document.getElementById('copy-scene-btn');
            const downloadStoryBtn = document.getElementById('download-story-btn');
            const uploadSourceBtn = document.getElementById('upload-source-btn');
            const serverSourceBtn = document.getElementById('server-source-btn');
            const clearStoryBtn = document.getElementById('clear-story-btn');
            const wakeLockIndicator = document.getElementById('wake-lock-indicator');

            let availableVoices = [];
            let selectedVoiceIndex = '';   // the single source of truth for voice
            let chunks = [];
            let currentChunkIndex = -1;
            let currentUtterance = null;
            let resumeIntervalId = null;
            let pendingPauseTimeout = null;
            let ttsActive = false;
            let ttsPaused = false;
            let currentSceneName = '';
            let currentSceneText = '';
            let currentSceneHeader = '';   // full header string, used by Copy Content
            let playbackRate = 1.1;

            let autoplayEnabled = false;
            let autoplayTimerId = null;
            let autoplayCountdown = 0;
            let autoplayWaiting = false;

            let cascadingSelectChange = false;

            let serverFetchDisabled = false;
            let loadRequestId = 0;

            let sceneContentEl = null;

            // ── Whole-scope mode ──
            // Exactly one of these should be true at a time. If all are false,
            // we're in "single scene" mode.
            let wholeEpisodeMode = false;
            let wholeVolumeMode = false;
            let wholeSeriesMode = false;

            // ── Header-inclusion prefs (used when a "whole" mode is active) ──
            let includeSceneHeaders = true;
            let includeEpisodeHeaders = true;
            let includeVolumeHeaders = true;

            // ── Copy Content prefs ──
            let copyIncludeHeader = true;

            // ── Bottom-button visibility prefs ──
            let showUploadBtn   = true;
            let showServerBtn   = true;
            let showClearBtn    = true;
            let showCopyBtn     = true;
            let showDownloadBtn = true;
            let showClearProgressBtn = true;

            // ── Clear Loaded Story behaviour ──
            let clearStoryAlsoClearsProgress = false;

            // ── Cutoff marker prefs ──
            // When true, the CUTOFF_MARKER line is ignored entirely (as if it
            // were just a RESUME_MARKER). Off by default.
            let ignoreCutoffMarker = false;

            // ── Server gate state ──
            let serverGateUnlocked = false;

            // ── Raw loaded story text (for Download File) ──
            let currentStoryText = '';

            // ── Narration prefs ──
            let screenAwakeEnabled = true;

            // ── Help & Settings-mode state ──
            let helpVisible = false;
            let settingsVisible = false;
            let resumeChunkIndex = -1;
            let resumeAutoStart = false;

            let storyData = null;
            let debugLog = [];

            // ── Screen Wake Lock state ──
            let wakeLockSentinel = null;
            let wakeLockSupported = ('wakeLock' in navigator);
            let wakeLockRequestPending = false;

            /* ========== PAGE TITLE SYNC ========== */

            // Keep <title> and the h1 span in sync with the configured title.
            // (If the page already hard-codes them, this is a harmless no-op.)
            try {
                document.title = `${STORY_TITLE} — Interactive Reader + TTS`;
                const titleSpan = document.querySelector('h1 > span');
                if (titleSpan) titleSpan.textContent = STORY_TITLE;
                const fileLabelCode = document.querySelector('.file-label code');
                if (fileLabelCode) fileLabelCode.textContent = STORY_FILE;
            } catch (e) { /* non-fatal */ }

            /* ========== STORAGE ========== */

            function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { console.warn('Storage read failed:', e); return null; } }
            function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { console.warn('Storage write failed:', e); return false; } }

            function makeStoryFingerprint(text) {
                const sample = `${text.length}|${text.slice(0, 160)}|${text.slice(-160)}`;
                let hash = 2166136261;
                for (let i = 0; i < sample.length; i++) { hash ^= sample.charCodeAt(i); hash = Math.imul(hash, 16777619); }
                return `fnv1a-${(hash >>> 0).toString(16)}`;
            }

            function loadPreferences() {
                try {
                    const raw = storageGet(STORAGE_KEYS.preferences); if (!raw) return;
                    const prefs = JSON.parse(raw);
                    if (Number.isFinite(prefs.playbackRate) && prefs.playbackRate >= 0.5 && prefs.playbackRate <= 2) {
                        playbackRate = prefs.playbackRate;
                        if (speedSlider) speedSlider.value = playbackRate;
                    }
                    if (typeof prefs.autoplayEnabled === 'boolean') autoplayEnabled = prefs.autoplayEnabled;
                    if (typeof prefs.wholeEpisodeMode === 'boolean') wholeEpisodeMode = prefs.wholeEpisodeMode;
                    if (typeof prefs.wholeVolumeMode === 'boolean') wholeVolumeMode = prefs.wholeVolumeMode;
                    if (typeof prefs.wholeSeriesMode === 'boolean') wholeSeriesMode = prefs.wholeSeriesMode;
                    if (typeof prefs.includeSceneHeaders === 'boolean') includeSceneHeaders = prefs.includeSceneHeaders;
                    if (typeof prefs.includeEpisodeHeaders === 'boolean') includeEpisodeHeaders = prefs.includeEpisodeHeaders;
                    if (typeof prefs.includeVolumeHeaders === 'boolean') includeVolumeHeaders = prefs.includeVolumeHeaders;
                    if (typeof prefs.copyIncludeHeader === 'boolean') copyIncludeHeader = prefs.copyIncludeHeader;
                    if (typeof prefs.screenAwakeEnabled === 'boolean') screenAwakeEnabled = prefs.screenAwakeEnabled;
                    if (typeof prefs.voiceIndex === 'string') selectedVoiceIndex = prefs.voiceIndex;
                    if (typeof prefs.showUploadBtn   === 'boolean') showUploadBtn   = prefs.showUploadBtn;
                    if (typeof prefs.showServerBtn   === 'boolean') showServerBtn   = prefs.showServerBtn;
                    if (typeof prefs.showClearBtn    === 'boolean') showClearBtn    = prefs.showClearBtn;
                    if (typeof prefs.showCopyBtn     === 'boolean') showCopyBtn     = prefs.showCopyBtn;
                    if (typeof prefs.showDownloadBtn === 'boolean') showDownloadBtn = prefs.showDownloadBtn;
                    if (typeof prefs.clearStoryAlsoClearsProgress === 'boolean') clearStoryAlsoClearsProgress = prefs.clearStoryAlsoClearsProgress;
                    if (typeof prefs.showClearProgressBtn === 'boolean') showClearProgressBtn = prefs.showClearProgressBtn;
                    if (typeof prefs.ignoreCutoffMarker === 'boolean') ignoreCutoffMarker = prefs.ignoreCutoffMarker;
                } catch (e) { console.warn('Preference restore failed:', e); }
            }

            function savePreferences() {
                let voiceName = '', voiceLang = '';
                if (selectedVoiceIndex !== '' && availableVoices[selectedVoiceIndex]) {
                    const v = availableVoices[selectedVoiceIndex];
                    voiceName = v.name; voiceLang = v.lang;
                }
                storageSet(STORAGE_KEYS.preferences, JSON.stringify({
                    showUploadBtn,
                    showServerBtn,
                    showClearBtn,
                    showCopyBtn,
                    showDownloadBtn,
                    clearStoryAlsoClearsProgress,
                    showClearProgressBtn,
                    playbackRate,
                    autoplayEnabled,
                    wholeEpisodeMode,
                    wholeVolumeMode,
                    wholeSeriesMode,
                    includeSceneHeaders,
                    includeEpisodeHeaders,
                    includeVolumeHeaders,
                    copyIncludeHeader,
                    screenAwakeEnabled,
                    voiceIndex: selectedVoiceIndex,
                    voiceName,
                    voiceLang,
                    ignoreCutoffMarker
                }));
            }

            function getSavedProgress() {
                try { const raw = storageGet(STORAGE_KEYS.progress); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
            }

            function saveReadingProgress() {
                if (!storyData || !currentStoryFingerprint || !volumeSelect.value || !episodeSelect.value) return;
                if (!isWholeModeActive() && !sceneSelect.value) return;

                // Resolve names + ordinals for the currently-selected items.
                // Volumes are 0-based (Volume 0 is reserved for the codex /
                // primer / foreword), episodes and scenes are 1-based.
                // Names are what the landing page reads — the raw episode /
                // scene fields below are IDs and aren't human-readable.
                let volumeName = volumeSelect.value;   // this one is already a name
                let episodeName = '';
                let sceneName = '';
                let volumeNumber = null, episodeNumber = null, sceneNumber = null;

                try {
                    const volValue = volumeSelect.value;
                    let vi = storyData.volumes.findIndex(v => v.name === volValue);
                    if (vi < 0) vi = storyData.volumes.findIndex(v => String(v.name).trim() === String(volValue).trim());
                    logDebug(`saveProgress: volume "${volValue}" → index ${vi}`);

                    if (vi >= 0) {
                        volumeNumber = vi;                 // 0-based
                        const vol = storyData.volumes[vi];
                        volumeName = vol.name || volumeName;

                        const epValue = episodeSelect.value;
                        let ei = vol.episodes.findIndex(e => e.id === epValue);
                        if (ei < 0) ei = vol.episodes.findIndex(e => e.name === epValue);
                        logDebug(`saveProgress: episode "${epValue}" → index ${ei} (of ${vol.episodes.length})`);

                        if (ei >= 0) {
                            episodeNumber = ei + 1;
                            const ep = vol.episodes[ei];
                            episodeName = ep.name || '';

                            if (!isWholeModeActive() && sceneSelect.value) {
                                const scValue = sceneSelect.value;
                                let si = ep.scenes.findIndex(s => s.id === scValue);
                                if (si < 0) si = ep.scenes.findIndex(s => s.name === scValue);
                                logDebug(`saveProgress: scene "${scValue}" → index ${si} (of ${ep.scenes.length})`);
                                if (si >= 0) {
                                    sceneNumber = si + 1;
                                    sceneName = ep.scenes[si].name || '';
                                }
                            }
                        }
                    }
                } catch (e) {
                    logDebug(`saveProgress: exception — ${e.message || e}`);
                }

                logDebug(`saveProgress: final = vol#${volumeNumber} "${volumeName}", ep#${episodeNumber} "${episodeName}", sc#${sceneNumber} "${sceneName}"`);

                storageSet(STORAGE_KEYS.progress, JSON.stringify({
                    fingerprint: currentStoryFingerprint,
                    // Raw select values (kept for backward-compat / resume matching).
                    volume: volumeSelect.value,
                    episode: episodeSelect.value,
                    scene: isWholeModeActive() ? '' : sceneSelect.value,
                    // Human-readable labels + ordinals.
                    volumeName,
                    episodeName,
                    sceneName,
                    volumeNumber,
                    episodeNumber,
                    sceneNumber,
                    wholeEpisode: wholeEpisodeMode,
                    wholeVolume: wholeVolumeMode,
                    wholeSeries: wholeSeriesMode,
                    savedAt: Date.now()
                }));
            }

            function clearSavedProgress(showStatus = true) {
                try { localStorage.removeItem(STORAGE_KEYS.progress); } catch (e) {}
                pendingResumeProgress = null; resumeBanner.classList.remove('visible');
                if (showStatus) setStatus('Saved reading progress cleared.');
            }

            function cacheStoryText(text, source) {
                const ok = storageSet(STORAGE_KEYS.storyCache, JSON.stringify({ fingerprint: makeStoryFingerprint(text), text, source: source || 'server', savedAt: Date.now() }));
                if (!ok) logDebug('Offline story cache could not be saved (browser storage may be full or disabled).');
            }

            function getCachedStory() {
                try { const raw = storageGet(STORAGE_KEYS.storyCache); const c = raw ? JSON.parse(raw) : null; return c && typeof c.text === 'string' && c.text ? c : null; } catch (e) { return null; }
            }

            function showResumeBanner(progress) {
                if (!progress) return;
                const label = progress.sceneName || progress.episode || 'previous position';
                resumeBanner.innerHTML = `↩ Resumed from <strong>${escapeHtml(label)}</strong>`;
                resumeBanner.classList.add('visible');
                setTimeout(() => resumeBanner.classList.remove('visible'), 1000);
            }

            /* ========== FOCUS MODE ========== */

            function setFocusMode(enabled) {
                document.body.classList.toggle('focus-mode', enabled);
                focusBtn.classList.toggle('active', enabled);
                focusBtn.textContent = enabled ? '⛶ Exit Focus' : '⛶ Focus Mode';
            }

            async function toggleFocusMode() {
                const entering = !document.body.classList.contains('focus-mode'); setFocusMode(entering);
                if (entering && document.documentElement.requestFullscreen && !document.fullscreenElement) { try { await document.documentElement.requestFullscreen(); } catch (e) { logDebug(`Fullscreen unavailable: ${e.message}`); } }
                if (!entering && document.fullscreenElement && document.exitFullscreen) { try { await document.exitFullscreen(); } catch (e) {} }
            }

            focusBtn.addEventListener('click', toggleFocusMode);
            document.addEventListener('fullscreenchange', function() { if (!document.fullscreenElement && document.body.classList.contains('focus-mode')) setFocusMode(false); });
            clearProgressBtn.addEventListener('click', function() { if (confirm('Forget your saved reading position?')) clearSavedProgress(); });

            function logDebug(msg) {
                debugLog.push(msg);
                console.log(msg);
                debugInfo.textContent = debugLog.join('\n');
            }

            debugToggle.addEventListener('click', function() {
                debugInfo.classList.toggle('visible');
                this.textContent = debugInfo.classList.contains('visible') ? '📋 Hide Debug Info' : '📋 Show Debug Info';
            });

            function setStatus(msg, isError = false) {
                statusEl.textContent = msg;
                statusEl.className = 'status' + (isError ? ' error' : '');
            }

            /* ========== SCREEN WAKE LOCK ========== */

            function updateWakeLockIndicator() {
                if (wakeLockSentinel && !wakeLockSentinel.released) {
                    wakeLockIndicator.classList.add('visible');
                } else {
                    wakeLockIndicator.classList.remove('visible');
                }
            }

            async function requestWakeLock() {
                if (!screenAwakeEnabled) return;
                if (!wakeLockSupported) {
                    logDebug('Wake Lock API not supported in this browser — screen may sleep during narration.');
                    return;
                }
                if (wakeLockSentinel && !wakeLockSentinel.released) {
                    updateWakeLockIndicator();
                    return;
                }
                if (wakeLockRequestPending) return;
                if (document.visibilityState !== 'visible') {
                    logDebug('Wake Lock: skipping request (page not visible).');
                    return;
                }

                wakeLockRequestPending = true;
                try {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    logDebug('Wake Lock: acquired — screen will stay awake.');
                    wakeLockSentinel.addEventListener('release', function() {
                        logDebug('Wake Lock: released by system.');
                        wakeLockSentinel = null;
                        updateWakeLockIndicator();
                        if (screenAwakeEnabled && ttsActive && !ttsPaused && document.visibilityState === 'visible') {
                            setTimeout(requestWakeLock, 1000);
                        }
                    });
                } catch (err) {
                    logDebug(`Wake Lock: request failed — ${err.name || 'Error'}: ${err.message || err}`);
                } finally {
                    wakeLockRequestPending = false;
                    updateWakeLockIndicator();
                }
            }

            async function releaseWakeLock() {
                if (!wakeLockSentinel) { updateWakeLockIndicator(); return; }
                const sentinel = wakeLockSentinel;
                wakeLockSentinel = null;
                try {
                    await sentinel.release();
                    logDebug('Wake Lock: released.');
                } catch (err) {
                    logDebug(`Wake Lock: release failed — ${err.message || err}`);
                }
                updateWakeLockIndicator();
            }

            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'visible') {
                    if (ttsActive && !ttsPaused) {
                        logDebug('Wake Lock: page visible again — re-acquiring.');
                        requestWakeLock();
                    }
                } else {
                    updateWakeLockIndicator();
                }
            });

            if (!wakeLockSupported) {
                logDebug('Wake Lock API unavailable — screen may turn off during long narration.');
            }
            /* ========== SPEECH TEXT SANITIZER ========== */

            function sanitizeForSpeech(text) {
                if (!text) return '';
                let s = text;
                // Strip cutoff / resume markers so TTS never reads them.
                s = stripCutoffAndResumeMarkers(s);
                s = s.replace(/\*{2,}/g, ' ');
                s = s.replace(/\*/g, '');
                s = s.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2');
                s = s.replace(/_{2,}/g, ' ');
                s = s.replace(/~/g, '');
                s = s.replace(/`/g, '');
                s = s.replace(/\^/g, '');
                s = s.replace(/\[([^\]]*)\]/g, '$1');
                s = s.replace(/\{([^}]*)\}/g, '$1');
                s = s.replace(/[\[\]\{\}]/g, '');
                s = s.replace(/\(/g, ', ');
                s = s.replace(/\)/g, ', ');
                s = s.replace(/#/g, ' ');
                s = s.replace(/\|/g, ', ');
                s = s.replace(/\s*\/\s*/g, ' or ');
                s = s.replace(/[—–]/g, ', ');
                s = s.replace(/[<>]/g, '');
                s = s.replace(/[“”]/g, '"');
                s = s.replace(/[‘’]/g, "'");
                s = s.replace(/\.{3,}/g, '…');
                s = s.replace(/\s*,\s*,+/g, ', ');
                s = s.replace(/,\s*([.!?])/g, '$1');
                s = s.replace(/\s{2,}/g, ' ');
                s = s.replace(/\s+([.,!?;:])/g, '$1');
                s = s.replace(/^\s*[,;:]\s*/, '');
                s = s.replace(/\s*[,;:]\s*$/, '');
                return s.trim();
            }

            /* ========== CUTOFF / RESUME MARKERS ========== */

            // Removes any line that is exactly the cutoff or resume marker,
            // and any inline occurrences of either marker.
            function stripCutoffAndResumeMarkers(text) {
                if (!text) return text;
                let out = text;
                if (CUTOFF_MARKER) {
                    out = out.split('\n')
                        .filter(line => line.trim() !== CUTOFF_MARKER)
                        .join('\n');
                    out = out.split(CUTOFF_MARKER).join('');
                }
                if (RESUME_MARKER) {
                    out = out.split('\n')
                        .filter(line => line.trim() !== RESUME_MARKER)
                        .join('\n');
                    out = out.split(RESUME_MARKER).join('');
                }
                return out;
            }

            /* ========== DIVIDER MARKERS ========== */

            function makeDividerMark(kind, name) {
                return `${DIVIDER_MARK_PREFIX}${kind}\u0001${name}`;
            }

            function isDividerLine(line) {
                return typeof line === 'string' && line.trimStart().startsWith(DIVIDER_MARK_PREFIX);
            }

            // Renders any divider marker in `text` back into readable plaintext.
            function stripDividerMarksForPlain(text) {
                return text.replace(
                    new RegExp(`${DIVIDER_MARK_PREFIX}(\\w+)\\u0001([^\\n]*)`, 'g'),
                    (_m, kind, name) => `${kind} - ${name}`
                );
            }

            // Removes divider-marker lines entirely (structural, not spoken).
            function stripDividerMarksForSpeech(text) {
                return text
                    .split('\n')
                    .filter(line => !isDividerLine(line))
                    .join('\n');
            }

            /* ========== SPEED SLIDER ========== */

            function updateSpeedReadout() {
                if (speedReadout) speedReadout.textContent = playbackRate.toFixed(2) + '×';
                const settingsReadout = document.getElementById('settings-speed-readout');
                if (settingsReadout) settingsReadout.textContent = playbackRate.toFixed(2) + '×';
                const settingsSlider = document.getElementById('settings-speed-slider');
                if (settingsSlider && parseFloat(settingsSlider.value) !== playbackRate) {
                    settingsSlider.value = playbackRate;
                }
            }

            if (speedSlider) {
                speedSlider.addEventListener('input', function() {
                    playbackRate = parseFloat(this.value);
                    updateSpeedReadout();
                    logDebug(`Playback speed set to ${playbackRate.toFixed(2)}×`);
                    savePreferences();
                });
            }

            updateSpeedReadout();

            /* ========== AUTOPLAY ========== */

            function updateAutoplayButton() {
                if (autoplayEnabled) {
                    autoplayBtn.textContent = '🔁 Autoplay: On';
                    autoplayBtn.classList.add('autoplay-on');
                } else {
                    autoplayBtn.textContent = '🔁 Autoplay: Off';
                    autoplayBtn.classList.remove('autoplay-on');
                }
            }

            function setAutoplay(enabled) {
                autoplayEnabled = enabled;
                updateAutoplayButton();
                savePreferences();
                logDebug(`Autoplay: ${enabled ? 'enabled' : 'disabled'}`);

                if (!enabled) {
                    cancelAutoplayCountdown();
                } else {
                    if (!ttsActive && chunks.length > 0 && currentChunkIndex >= chunks.length) {
                        const list = getCurrentNavList();
                        const flatIndex = getCurrentNavIndex();
                        if (flatIndex >= 0 && flatIndex < list.length - 1) {
                            startAutoplayCountdown();
                        } else {
                            logDebug('Autoplay: no next item available — disabling');
                            setAutoplay(false);
                            setStatus('Autoplay: last item reached.');
                        }
                    }
                }
            }

            function startAutoplayCountdown() {
                if (!autoplayEnabled) return;
                if (autoplayTimerId) { clearInterval(autoplayTimerId); autoplayTimerId = null; }

                autoplayCountdown = AUTOPLAY_DELAY_SEC;
                timerCountdown.textContent = autoplayCountdown;
                autoplayWaiting = true;

                chunkPanel.classList.add('autoplay-waiting');
                chunkPanelText.textContent = `Next item starting in ${AUTOPLAY_DELAY_SEC} seconds…`;
                chunkPanelText.classList.add('is-autoplay-wait');
                chunkPanelText.classList.remove('is-empty', 'is-pause');
                autoplayTimer.style.display = 'flex';

                autoplayTimerId = setInterval(function() {
                    autoplayCountdown--;
                    timerCountdown.textContent = autoplayCountdown;
                    chunkPanelText.textContent = `Next item starting in ${autoplayCountdown} second${autoplayCountdown === 1 ? '' : 's'}…`;

                    if (autoplayCountdown <= 0) {
                        clearInterval(autoplayTimerId);
                        autoplayTimerId = null;
                        autoplayTimer.style.display = 'none';
                        autoplayWaiting = false;
                        chunkPanel.classList.remove('autoplay-waiting');
                        chunkPanelText.classList.remove('is-autoplay-wait');

                        if (autoplayEnabled) {
                            goToNextNav(true);
                        }
                    }
                }, 1000);
            }

            function cancelAutoplayCountdown() {
                if (autoplayTimerId) { clearInterval(autoplayTimerId); autoplayTimerId = null; }
                autoplayWaiting = false;
                autoplayTimer.style.display = 'none';
                chunkPanel.classList.remove('autoplay-waiting');
                chunkPanelText.classList.remove('is-autoplay-wait');
                refreshChunkPanelIdleMessage();
            }

            cancelAutoplayBtn.addEventListener('click', function() {
                setAutoplay(false);
                setStatus('Autoplay cancelled.');
            });

            autoplayBtn.addEventListener('click', function() {
                setAutoplay(!autoplayEnabled);
                setStatus(autoplayEnabled
                    ? 'Autoplay enabled — will advance after each item.'
                    : 'Autoplay disabled.');
            });

            /* ========== UI STATE HELPERS ========== */

            function refreshChunkPanelIdleMessage() {
                if (autoplayWaiting) return;

                if (chunks.length > 0 &&
                    currentChunkIndex >= 0 &&
                    currentChunkIndex < chunks.length) {
                    const c = chunks[currentChunkIndex];
                    const isDivider = !c.isPause && isDividerLine(c.text);
                    if (isDivider) {
                        chunkPanelText.textContent = '— section break —';
                        chunkPanelText.classList.add('is-pause');
                        chunkPanelText.classList.remove('is-empty', 'is-autoplay-wait');
                    } else if (c.isPause) {
                        chunkPanelText.textContent = '— beat —';
                        chunkPanelText.classList.add('is-pause');
                        chunkPanelText.classList.remove('is-empty', 'is-autoplay-wait');
                    } else {
                        chunkPanelText.textContent = c.text;
                        chunkPanelText.classList.remove('is-pause', 'is-empty', 'is-autoplay-wait');
                    }
                } else {
                    chunkPanelText.textContent = 'Narrated text will appear here.';
                    chunkPanelText.classList.add('is-empty');
                    chunkPanelText.classList.remove('is-pause', 'is-autoplay-wait');
                }
            }

            function highlightCurrentChunkSpan(index) {
                if (!sceneContentEl) return;
                const prev = sceneContentEl.querySelector('.chunk-span.is-current');
                if (prev) prev.classList.remove('is-current');
                if (index < 0) return;
                const next = sceneContentEl.querySelector(`.chunk-span[data-chunk-index="${index}"]`);
                if (next) next.classList.add('is-current');
            }

            function setNarrationActiveClass(active) {
                if (!sceneContentEl) return;
                if (active) {
                    sceneContentEl.classList.add('narration-active');
                } else {
                    sceneContentEl.classList.remove('narration-active');
                    const cur = sceneContentEl.querySelector('.chunk-span.is-current');
                    if (cur) cur.classList.remove('is-current');
                }
            }

            function updateChunkUI() {
                if (chunks.length === 0) {
                    chunkCounter.textContent = '— / —';
                    prevBtn.disabled = true;
                    replayBtn.disabled = true;
                    nextBtn.disabled = true;
                    refreshChunkPanelIdleMessage();
                    highlightCurrentChunkSpan(-1);
                    return;
                }

                const displayIdx = currentChunkIndex >= 0 ? currentChunkIndex + 1 : 0;
                chunkCounter.textContent = `${displayIdx} / ${chunks.length}`;

                refreshChunkPanelIdleMessage();
                highlightCurrentChunkSpan(currentChunkIndex);

                const sessionLive = ttsActive;
                prevBtn.disabled = !sessionLive || currentChunkIndex <= 0;
                replayBtn.disabled = !sessionLive || currentChunkIndex < 0 || currentChunkIndex >= chunks.length;
                nextBtn.disabled = !sessionLive || currentChunkIndex >= chunks.length - 1;
            }

            function setTtsButtonsActive(active) {
                pauseBtn.disabled = !active;
                stopBtn.disabled = !active;
                updateChunkUI();
            }

            /* ========== COPY / DOWNLOAD ========== */

            async function copyCurrentContentToClipboard() {
                let bodyPlain = stripDividerMarksForPlain(currentSceneText || '');
                bodyPlain = stripCutoffAndResumeMarkers(bodyPlain);

                let text = '';
                if (copyIncludeHeader && currentSceneHeader) {
                    text = currentSceneHeader + '\n\n\n\n' + bodyPlain;
                } else {
                    text = bodyPlain;
                }

                text = text + '\n\n\n\n';

                if (!text.trim()) {
                    setStatus('Nothing to copy — no content loaded.', true);
                    return;
                }

                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.setAttribute('readonly', '');
                        ta.style.position = 'fixed';
                        ta.style.top = '-9999px';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        ta.setSelectionRange(0, ta.value.length);
                        const ok = document.execCommand('copy');
                        document.body.removeChild(ta);
                        if (!ok) throw new Error('execCommand("copy") failed');
                    }

                    setStatus(`📋 Copied content to clipboard: ${currentSceneName}`);
                    logDebug(`Copy Content: copied "${currentSceneName}" (${text.length} chars, header=${copyIncludeHeader})`);
                } catch (err) {
                    console.warn('Copy failed:', err);
                    logDebug(`Copy Content failed: ${err.message || err}`);
                    setStatus('Could not copy to clipboard.', true);
                }
            }

            copySceneBtn.addEventListener('click', copyCurrentContentToClipboard);

            function downloadCurrentStory() {
                let text = currentStoryText;
                if (!text) {
                    const cached = getCachedStory();
                    if (cached && cached.text) text = cached.text;
                }
                if (!text) { setStatus('No story loaded to download.', true); return; }

                const name = currentStorySource && currentStorySource.startsWith('local:')
                    ? currentStorySource.slice(6)
                    : (STORY_FILE.split('/').pop().split('?')[0] || 'story.txt');

                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setStatus(`⬇ Downloaded: ${name}`);
                logDebug(`Download File: ${name} (${text.length} chars)`);
            }

            if (downloadStoryBtn) {
                downloadStoryBtn.addEventListener('click', downloadCurrentStory);
            }

            /* ========== SERVER GATE ========== */

            function isServerGateEnabled() {
                return SERVER_GATE_HASH.length === 64;
            }

            function readGateSession() {
                try { return sessionStorage.getItem(SERVER_GATE_SESSION_KEY) === '1'; }
                catch (e) { return false; }
            }

            function writeGateSession() {
                try { sessionStorage.setItem(SERVER_GATE_SESSION_KEY, '1'); } catch (e) {}
            }

            async function sha256Hex(str) {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
                return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
            }

            function promptForPassword() {
                return new Promise(resolve => {
                    const overlay = document.createElement('div');
                    overlay.className = 'gate-overlay';
                    overlay.innerHTML = `
                        <div class="gate-modal" role="dialog" aria-modal="true" aria-labelledby="gate-title">
                            <h3 id="gate-title">🔒 Server Access</h3>
                            <p>Enter the password to reload the story from the server.<br>
                               <small>Loading from your computer and resuming your saved position remain unrestricted.</small></p>


                            <div class="gate-password-wrap">
                                <input type="password" id="gate-password-input"
                                       autocomplete="current-password"
                                       placeholder="Password">
                            </div>
                            <div class="password-toggle">
                                <label class="whole-episode-toggle">
                                    <input type="checkbox" id="gate-toggle-password">
                                    Show password
                                </label>
                            </div>

                            <div class="gate-error" id="gate-error" aria-live="polite"></div>
                            <div class="gate-actions">
                                <button type="button" id="gate-cancel">Cancel</button>
                                <button type="button" id="gate-submit">Unlock</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(overlay);

                    const input = overlay.querySelector('#gate-password-input');
                    const errEl = overlay.querySelector('#gate-error');
                    const submit = overlay.querySelector('#gate-submit');
                    const cancel = overlay.querySelector('#gate-cancel');
                    const toggle = overlay.querySelector('#gate-toggle-password');


                    toggle.addEventListener('change', () => {
                        input.type = toggle.checked ? 'text' : 'password';
                    });

                    // Toggle password visibility
                    toggle.addEventListener('click', () => {
                        const showing = input.type === 'password';
                        input.type = showing ? 'text' : 'password';
                        toggle.textContent = showing ? 'Hide' : 'Show';
                        toggle.setAttribute('aria-label',
                            showing ? 'Hide password' : 'Show password');
                        toggle.setAttribute('aria-pressed', String(showing));
                        input.focus();
                    });

                    function close(value) {
                        document.removeEventListener('keydown', onKey);
                        overlay.remove();
                        resolve(value);
                    }

                    function onKey(e) {
                        if (e.key === 'Escape') close(null);
                    }

                    document.addEventListener('keydown', onKey);

                    submit.addEventListener('click', () => {
                        if (!input.value) {
                            errEl.textContent = 'Password required.';
                            return;
                        }
                        close(input.value);
                    });

                    cancel.addEventListener('click', () => close(null));

                    input.addEventListener('keydown', e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit.click();
                        }
                    });

                    setTimeout(() => input.focus(), 30);
                });
            }

            async function ensureServerGateUnlocked() {
                if (!isServerGateEnabled()) return true;
                if (serverGateUnlocked) return true;
                if (readGateSession()) { serverGateUnlocked = true; return true; }

                const pwd = await promptForPassword();
                if (pwd === null) {
                    setStatus('Server load cancelled.', true);
                    return false;
                }

                const hashed = await sha256Hex(pwd);
                if (hashed !== SERVER_GATE_HASH) {
                    setStatus('Incorrect password — server load blocked.', true);
                    logDebug('Server gate: incorrect password.');
                    return false;
                }

                serverGateUnlocked = true;
                writeGateSession();
                logDebug('Server gate: unlocked for this session.');
                setStatus('Server access unlocked for this session.');
                return true;
            }
            /* ========== NAVIGATION LISTS ========== */

            function isWholeModeActive() {
                return wholeEpisodeMode || wholeVolumeMode || wholeSeriesMode;
            }

            function getFlatSceneList() {
                if (!storyData || !storyData.volumes) return [];
                const list = [];
                storyData.volumes.forEach((vol, vi) => {
                    vol.episodes.forEach((ep, ei) => {
                        ep.scenes.forEach((sc, si) => {
                            list.push({
                                volumeIndex: vi,
                                episodeIndex: ei,
                                sceneIndex: si,
                                volumeName: vol.name,
                                episodeName: ep.name,
                                sceneName: sc.name,
                                sceneId: sc.id,
                                episodeId: ep.id
                            });
                        });
                    });
                });
                return list;
            }

            function getFlatEpisodeList() {
                if (!storyData || !storyData.volumes) return [];
                const list = [];
                storyData.volumes.forEach((vol, vi) => {
                    vol.episodes.forEach((ep, ei) => {
                        list.push({
                            volumeIndex: vi,
                            episodeIndex: ei,
                            volumeName: vol.name,
                            episodeName: ep.name,
                            episodeId: ep.id
                        });
                    });
                });
                return list;
            }

            function getFlatVolumeList() {
                if (!storyData || !storyData.volumes) return [];
                return storyData.volumes.map((vol, vi) => ({
                    volumeIndex: vi,
                    volumeName: vol.name
                }));
            }

            function getCurrentFlatIndex() {
                const volVal = volumeSelect.value;
                const epId = episodeSelect.value;
                const scId = sceneSelect.value;
                if (!volVal || !epId || !scId) return -1;

                const list = getFlatSceneList();
                return list.findIndex(item =>
                    item.volumeName === volVal &&
                    item.sceneId === scId
                );
            }

            function getCurrentFlatEpisodeIndex() {
                const volVal = volumeSelect.value;
                const epId = episodeSelect.value;
                if (!volVal || !epId) return -1;
                const list = getFlatEpisodeList();
                return list.findIndex(item =>
                    item.volumeName === volVal &&
                    item.episodeId === epId
                );
            }

            function getCurrentFlatVolumeIndex() {
                const volVal = volumeSelect.value;
                if (!volVal) return -1;
                const list = getFlatVolumeList();
                return list.findIndex(item => item.volumeName === volVal);
            }

            function getCurrentNavList() {
                if (wholeSeriesMode) return [{}];
                if (wholeVolumeMode) return getFlatVolumeList();
                if (wholeEpisodeMode) return getFlatEpisodeList();
                return getFlatSceneList();
            }

            function getCurrentNavIndex() {
                if (wholeSeriesMode) return 0;
                if (wholeVolumeMode) return getCurrentFlatVolumeIndex();
                if (wholeEpisodeMode) return getCurrentFlatEpisodeIndex();
                return getCurrentFlatIndex();
            }

            function getSelectedEpisode() {
                if (!storyData || !volumeSelect.value || !episodeSelect.value) return null;
                const volume = storyData.volumes.find(v => v.name === volumeSelect.value);
                if (!volume) return null;
                return volume.episodes.find(e => e.id === episodeSelect.value) || null;
            }

            function getSelectedVolume() {
                if (!storyData || !volumeSelect.value) return null;
                return storyData.volumes.find(v => v.name === volumeSelect.value) || null;
            }

            function getSelectedScene() {
                if (!storyData || !volumeSelect.value || !episodeSelect.value || !sceneSelect.value) return null;
                const volume = storyData.volumes.find(v => v.name === volumeSelect.value);
                if (!volume) return null;
                const episode = volume.episodes.find(e => e.id === episodeSelect.value);
                if (!episode) return null;
                return episode.scenes.find(s => s.id === sceneSelect.value) || null;
            }

            /* ========== CONTENT BUILDERS ========== */

            function joinWithGaps(pieces, gap) {
                return pieces.join('\n'.repeat(gap + 1));
            }

            function buildSceneTextInternal(scene) {
                let out = '';
                if (includeSceneHeaders) {
                    out += makeDividerMark('SCENE', scene.name) + '\n\n';
                }
                out += stripIndentation(scene.content);
                return out;
            }

            function buildWholeEpisodeTextInternal(episode) {
                if (!episode || !episode.scenes.length) return '';
                const pieces = episode.scenes.map(sc => buildSceneTextInternal(sc));
                return joinWithGaps(pieces, SCENE_GAP_BLANK_LINES);
            }

            function buildWholeVolumeTextInternal(volume) {
                if (!volume || !volume.episodes.length) return '';
                const pieces = volume.episodes.map(ep => {
                    let out = '';
                    if (includeEpisodeHeaders) {
                        out += makeDividerMark('EPISODE', ep.name) + '\n\n';
                    }
                    out += buildWholeEpisodeTextInternal(ep);
                    return out;
                });
                return joinWithGaps(pieces, SCENE_GAP_BLANK_LINES * 2);
            }

            function buildWholeSeriesTextInternal() {
                if (!storyData || !storyData.volumes.length) return '';
                const pieces = storyData.volumes.map(vol => {
                    let out = '';
                    if (includeVolumeHeaders) {
                        out += makeDividerMark('VOLUME', vol.name) + '\n\n';
                    }
                    out += buildWholeVolumeTextInternal(vol);
                    return out;
                });
                return joinWithGaps(pieces, SCENE_GAP_BLANK_LINES * 3);
            }

            function buildCurrentContent() {
                if (wholeSeriesMode) {
                    if (!storyData || !storyData.volumes.length) return null;
                    return {
                        title: STORY_TITLE,
                        body: buildWholeSeriesTextInternal(),
                        header: 'SERIES - ' + STORY_TITLE
                    };
                }
                if (wholeVolumeMode) {
                    const volume = getSelectedVolume();
                    if (!volume) return null;
                    return {
                        title: volume.name,
                        body: buildWholeVolumeTextInternal(volume),
                        header: 'VOLUME - ' + volume.name
                    };
                }
                if (wholeEpisodeMode) {
                    const episode = getSelectedEpisode();
                    if (!episode) return null;
                    return {
                        title: episode.name,
                        body: buildWholeEpisodeTextInternal(episode),
                        header: 'EPISODE - ' + episode.name
                    };
                }
                const scene = getSelectedScene();
                if (!scene) return null;
                return {
                    title: scene.name,
                    body: stripIndentation(scene.content),
                    header: 'SCENE - ' + scene.name
                };
            }

            /* ========== NAVIGATION ========== */

            function selectSceneByFlatIndex(flatIndex, autoStart) {
                const list = getFlatSceneList();
                if (flatIndex < 0 || flatIndex >= list.length) return;

                const target = list[flatIndex];
                const volume = storyData.volumes[target.volumeIndex];

                cascadingSelectChange = true;

                volumeSelect.value = target.volumeName;

                const episodeLabels = volume.episodes.map((e, index) => ({
                    id: e.id,
                    label: `${index + 1} - ${e.name}`
                }));
                populateSelect(episodeSelect, episodeLabels, '— Select Episode —');
                episodeSelect.disabled = false;

                const episode = volume.episodes[target.episodeIndex];
                episodeSelect.value = episode.id;

                const sceneItems = episode.scenes.map((s, index) => ({
                    id: s.id,
                    label: `${index + 1} - ${s.name}`
                }));
                populateSelect(sceneSelect, sceneItems, '— Select Scene —');
                sceneSelect.disabled = isWholeModeActive();

                sceneSelect.value = target.sceneId;

                cascadingSelectChange = false;

                displaySelectedScene(autoStart);
                updateSceneNavButtons();
            }

            function selectEpisodeByFlatIndex(flatIndex, autoStart) {
                const list = getFlatEpisodeList();
                if (flatIndex < 0 || flatIndex >= list.length) return;

                const target = list[flatIndex];
                const volume = storyData.volumes[target.volumeIndex];
                const episode = volume.episodes[target.episodeIndex];

                cascadingSelectChange = true;

                volumeSelect.value = target.volumeName;

                const episodeLabels = volume.episodes.map((e, index) => ({
                    id: e.id,
                    label: `${index + 1} - ${e.name}`
                }));
                populateSelect(episodeSelect, episodeLabels, '— Select Episode —');
                episodeSelect.disabled = false;
                episodeSelect.value = episode.id;

                const sceneItems = episode.scenes.map((s, index) => ({
                    id: s.id,
                    label: `${index + 1} - ${s.name}`
                }));
                populateSelect(sceneSelect, sceneItems, '— Select Scene —');
                sceneSelect.disabled = isWholeModeActive();
                if (episode.scenes.length) sceneSelect.value = episode.scenes[0].id;

                cascadingSelectChange = false;

                displaySelectedScene(autoStart);
                updateSceneNavButtons();
            }

            function selectVolumeByFlatIndex(flatIndex, autoStart) {
                const list = getFlatVolumeList();
                if (flatIndex < 0 || flatIndex >= list.length) return;

                const target = list[flatIndex];
                const volume = storyData.volumes[target.volumeIndex];

                cascadingSelectChange = true;

                volumeSelect.value = target.volumeName;

                const episodeLabels = volume.episodes.map((e, index) => ({
                    id: e.id,
                    label: `${index + 1} - ${e.name}`
                }));
                populateSelect(episodeSelect, episodeLabels, '— Select Episode —');
                episodeSelect.disabled = false;
                if (volume.episodes.length) episodeSelect.value = volume.episodes[0].id;

                const firstEpisode = volume.episodes[0];
                if (firstEpisode) {
                    const sceneItems = firstEpisode.scenes.map((s, index) => ({
                        id: s.id,
                        label: `${index + 1} - ${s.name}`
                    }));
                    populateSelect(sceneSelect, sceneItems, '— Select Scene —');
                    sceneSelect.disabled = isWholeModeActive();
                    if (firstEpisode.scenes.length) sceneSelect.value = firstEpisode.scenes[0].id;
                }

                cascadingSelectChange = false;

                displaySelectedScene(autoStart);
                updateSceneNavButtons();
            }

            function goToPrevNav() {
                if (wholeSeriesMode) return;
                if (wholeVolumeMode) {
                    const idx = getCurrentFlatVolumeIndex();
                    if (idx <= 0) return;
                    selectVolumeByFlatIndex(idx - 1, autoplayEnabled);
                    return;
                }
                if (wholeEpisodeMode) {
                    const idx = getCurrentFlatEpisodeIndex();
                    if (idx <= 0) return;
                    selectEpisodeByFlatIndex(idx - 1, autoplayEnabled);
                    return;
                }
                const flatIndex = getCurrentFlatIndex();
                if (flatIndex <= 0) return;
                selectSceneByFlatIndex(flatIndex - 1, autoplayEnabled);
            }

            function goToNextNav(autoStart) {
                if (wholeSeriesMode) return;
                if (wholeVolumeMode) {
                    const idx = getCurrentFlatVolumeIndex();
                    const list = getFlatVolumeList();
                    if (idx < 0 || idx >= list.length - 1) return;
                    selectVolumeByFlatIndex(idx + 1, !!autoStart);
                    return;
                }
                if (wholeEpisodeMode) {
                    const idx = getCurrentFlatEpisodeIndex();
                    const list = getFlatEpisodeList();
                    if (idx < 0 || idx >= list.length - 1) return;
                    selectEpisodeByFlatIndex(idx + 1, !!autoStart);
                    return;
                }
                const flatIndex = getCurrentFlatIndex();
                const list = getFlatSceneList();
                if (flatIndex < 0 || flatIndex >= list.length - 1) return;
                selectSceneByFlatIndex(flatIndex + 1, !!autoStart);
            }

            function applyBottomButtonVisibility() {
                uploadSourceBtn.style.display   = showUploadBtn   ? '' : 'none';
                serverSourceBtn.style.display   = showServerBtn   ? '' : 'none';
                clearStoryBtn.style.display     = showClearBtn    ? '' : 'none';
                copySceneBtn.style.display      = showCopyBtn     ? '' : 'none';
                if (downloadStoryBtn) downloadStoryBtn.style.display = showDownloadBtn ? '' : 'none';
                if (clearProgressBtn) clearProgressBtn.style.display = showClearProgressBtn ? '' : 'none'
            }

            function updateSceneNavButtons() {
                const list = getCurrentNavList();

                if (list.length === 0) {
                    scenePrevBtn.disabled = true;
                    sceneNextBtn.disabled = true;
                    sceneNavSpacer.textContent = '—';
                    scenePrevBtnBottom.disabled = true;
                    sceneNextBtnBottom.disabled = true;
                    sceneNavSpacerBottom.textContent = '—';
                    copySceneBtn.disabled = true;
                    if (downloadStoryBtn) downloadStoryBtn.disabled = true;
                    applyBottomButtonVisibility();
                    return;
                }

                const flatIndex = getCurrentNavIndex();
                if (flatIndex < 0) {
                    scenePrevBtn.disabled = true;
                    sceneNextBtn.disabled = true;
                    sceneNavSpacer.textContent = '—';
                    scenePrevBtnBottom.disabled = true;
                    sceneNextBtnBottom.disabled = true;
                    sceneNavSpacerBottom.textContent = '—';
                    copySceneBtn.disabled = true;
                    if (downloadStoryBtn) downloadStoryBtn.disabled = true;
                    applyBottomButtonVisibility();
                    return;
                }

                const prevDisabled = wholeSeriesMode ? true : (flatIndex <= 0);
                const nextDisabled = wholeSeriesMode ? true : (flatIndex >= list.length - 1);

                scenePrevBtn.disabled = prevDisabled;
                sceneNextBtn.disabled = nextDisabled;
                scenePrevBtnBottom.disabled = prevDisabled;
                sceneNextBtnBottom.disabled = nextDisabled;

                let positionText = '';
                if (wholeSeriesMode) {
                    positionText = `Whole Series (${storyData.volumes.length} volumes)`;
                } else {
                    const item = list[flatIndex];
                    if (wholeVolumeMode) {
                        positionText = `${flatIndex + 1} / ${list.length} — ${item.volumeName}`;
                    } else if (wholeEpisodeMode) {
                        positionText = `${flatIndex + 1} / ${list.length} — ${item.volumeName} · ${item.episodeName}`;
                    } else {
                        positionText = `${flatIndex + 1} / ${list.length} — ${item.volumeName} · ${item.episodeName}`;
                    }
                }
                sceneNavSpacer.textContent = positionText;
                sceneNavSpacerBottom.textContent = positionText;

                const hasScene = !!currentSceneText && !helpVisible && !settingsVisible;
                copySceneBtn.disabled = !hasScene;
                if (downloadStoryBtn) downloadStoryBtn.disabled = !hasActiveReadingProgress();
                applyBottomButtonVisibility();
            }

            function handlePrevSceneNavigation() { goToPrevNav(); }
            function handleNextSceneNavigation() { goToNextNav(autoplayEnabled); }

            scenePrevBtn.addEventListener('click', handlePrevSceneNavigation);
            scenePrevBtnBottom.addEventListener('click', handlePrevSceneNavigation);
            sceneNextBtn.addEventListener('click', handleNextSceneNavigation);
            sceneNextBtnBottom.addEventListener('click', handleNextSceneNavigation);

            /* ========== HELP & SETTINGS PANELS ========== */

            function helpHTML() {
                const t = escapeHtml(STORY_TITLE);
                return `
                <div class="help-panel">
                    <h3>📄 Site Pages</h3>
                    <ul>
                        <li><a href="legal.html" rel="noopener">Legal Disclaimer &amp; Contact</a> — Full legal disclaimer, copyright and IP information, and a contact form for legal or licensing enquiries.</li>
                        <li><a href="contentwarning.html" rel="noopener">Content Warning</a> — An in-depth guide to the sensitive content depicted in <em>${t}</em>, including an episode-by-episode breakdown, support resources, and a form to suggest changes.</li>
                        <li><a href="../misc/splitter.html" rel="noopener">Splitter</a> — A small tool for splitting the story file into separate episode .txt files, packaged as a downloadable .zip.</li>
                    </ul>
                    <h3>📖 Reading &amp; Navigation</h3>
                    <p>The three dropdowns at the top let you pick a <strong>Volume</strong>, <strong>Episode</strong>, and <strong>Scene</strong>. When a story is loaded, the first available item in each list is chosen automatically.</p>
                    <ul>
                        <li><strong>Whole Series</strong>, <strong>Whole Volume</strong>, and <strong>Whole Episode</strong> toggles sit beneath their respective dropdowns. Exactly one can be active at a time, and each parses a progressively wider slice of the story as one continuous narration.</li>
                        <li><strong>◀ Previous Scene / Next Scene ▶</strong> — Step through the story by whichever scope is active.</li>
                        <li><strong>Scene position indicator</strong> — Between the two scene nav buttons, shows your place in the story.</li>
                        <li><strong>Header inclusion</strong> — Settings has toggles to include Scene / Episode / Volume headers inside wider-parsed text.</li>
                        <li><strong>Cutoff &amp; resume markers</strong> — A line consisting of <code>${escapeHtml(CUTOFF_MARKER)}</code> stops the reader from loading any content after it (unless <em>Ignore cutoff marker</em> is enabled in Settings). A line consisting of <code>${escapeHtml(RESUME_MARKER)}</code> lets parsing continue from that point onward — useful for cutting out sections without stopping the whole file. Both marker lines are hidden from the reader entirely.</li>
                    </ul>

                    <h3>🔊 Narration</h3>
                    <ul>
                        <li><strong>Speak Scene</strong> — Begin narrating the current content from the start.</li>
                        <li><strong>Pause / Resume</strong> — Temporarily halt the narrator without losing your place.</li>
                        <li><strong>Stop</strong> — End narration entirely and reset the chunk counter.</li>
                        <li><strong>Prev / Replay / Next (chunk buttons)</strong> — Skip backward, repeat, or skip forward one spoken chunk at a time.</li>
                        <li><strong>Speed, Voice, and Screen Awake</strong> — These are in the Settings panel.</li>
                    </ul>

                    <h3>🔁 Autoplay</h3>
                    <p>Toggle Autoplay on to have the reader automatically advance to the next item (scene, episode, or volume depending on the Whole-* mode) after the current one finishes. A countdown appears in the transcript panel.</p>

                    <h3>📝 Transcript Panel</h3>
                    <p>The panel above always shows either the chunk currently being spoken, a beat marker for paragraph breaks, or a placeholder when idle. During an Autoplay countdown it shows the remaining seconds.</p>

                    <h3>🖱️ Interactive Chunks</h3>
                    <p>While narration is active, each chunk in the scene becomes clickable. <strong>Hover</strong> over any sentence to see its boundaries; the chunk currently being spoken is highlighted in orange. <strong>Click</strong> a chunk to jump narration to that exact point.</p>

                    <h3>📂 Story Source</h3>
                    <ul>
                        <li><strong>📂 Load from Computer</strong> — Clear the currently loaded story and switch to manual upload mode.</li>
                        <li><strong>🔄 Reload from Server</strong> — Clear the currently loaded story and fetch the latest version from the server.</li>
                        <li><strong>🧹 Clear Loaded Story</strong> — Unload the current story without touching your saved reading position or offline cache.</li>
                        <li><strong>📋 Copy Content</strong> — Copy the current content to your clipboard. Settings controls whether the header is included.</li>
                        <li><strong>⬇ Download File</strong> — Save the currently loaded story file to your device as a .txt file.</li>
                    </ul>

                    <h3>💾 Reader Convenience</h3>
                    <ul>
                        <li><strong>Remember where you were</strong> — Last Volume / Episode / Scene / Whole-* mode are restored when the same story version loads.</li>
                        <li><strong>Persistent settings</strong> — Speed, voice, Autoplay, Whole-* modes, header-inclusion toggles, and Copy options are remembered.</li>
                        <li><strong>⛶ Focus Mode</strong> — Hides surrounding controls and attempts to enter fullscreen.</li>
                        <li><strong>Offline persistence</strong> — The most recently loaded story is cached in your browser.</li>
                        <li><strong>Clear Saved Progress</strong> — Removes the remembered reading position. Cache and settings are unaffected.</li>
                    </ul>

                    <h3>⚙️ Settings &amp; ❓ Help</h3>
                    <p>Both panels pause narration when opened and restore it when closed.</p>

                    <span class="help-hint">Press the Help button again to close this panel and return to your content.</span>
                </div>
            `;
            }

            function settingsHTML() {
                return `
                <div class="settings-panel">
                    <h3>⏹ Cutoff &amp; Resume Markers</h3>
                    <p>Your story file can include special marker lines to hide sections. A line consisting of <code>${escapeHtml(CUTOFF_MARKER)}</code> stops the reader from loading any content after it. A line consisting of <code>${escapeHtml(RESUME_MARKER)}</code> lets parsing continue from that point onwards. Both marker lines are always hidden from the reader.</p>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-ignore-cutoff">
                            Ignore cutoff marker
                            <span class="settings-row-hint">When enabled, the cutoff marker (<code>${escapeHtml(CUTOFF_MARKER)}</code>) is treated like a resume marker: it is removed, and parsing continues. When disabled (default), everything after the cutoff marker is withheld. The resume marker (<code>${escapeHtml(RESUME_MARKER)}</code>) always lets parsing continue.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-ignore-cutoff">
                                <span id="settings-ignore-cutoff-state">Off</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-note">
                        Changing this reloads the currently loaded story so the change takes effect immediately. Your saved reading position is preserved.
                    </div>

                    <h3>📚 Whole-* Header Inclusion</h3>
                    <p>These options only apply when a <em>Whole Series</em>, <em>Whole Volume</em>, or <em>Whole Episode</em> toggle is active. They add a divider line above each included section.</p>

                    <div class="settings-section-subheader">Included in the parsed narration text</div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-include-scene-headers">
                            Include Scene headers
                            <span class="settings-row-hint">Adds a "SCENE - &lt;name&gt;" divider above each scene.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-include-scene-headers">
                                <span id="settings-include-scene-headers-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-include-episode-headers">
                            Include Episode headers
                            <span class="settings-row-hint">Adds an "EPISODE - &lt;name&gt;" divider above each episode.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-include-episode-headers">
                                <span id="settings-include-episode-headers-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-include-volume-headers">
                            Include Volume headers
                            <span class="settings-row-hint">Adds a "VOLUME - &lt;name&gt;" divider above each volume.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-include-volume-headers">
                                <span id="settings-include-volume-headers-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-note">
                        When you change any of these, the currently displayed content is re-parsed automatically.
                    </div>

                    <h3>📋 Copy Content</h3>
                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-copy-include-header">
                            Include header when copying
                            <span class="settings-row-hint">Prepends the current content's title and a few blank lines before the copied text.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-copy-include-header">
                                <span id="settings-copy-include-header-state">On</span>
                            </label>
                        </span>
                    </div>

                    <h3>🧰 Bottom Toolbar</h3>
                    <p>Choose which buttons appear beneath the reader. Hiding a button is a <em>display</em> preference only — it is not access control.</p>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-show-upload-btn">
                            Show "Load from Computer"
                            <span class="settings-row-hint">The 📂 button in the bottom toolbar.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-show-upload-btn">
                                <span id="settings-show-upload-btn-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-show-server-btn">
                            Show "Reload from Server"
                            <span class="settings-row-hint">The 🔄 button in the bottom toolbar.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-show-server-btn">
                                <span id="settings-show-server-btn-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-show-clear-btn">
                            Show "Clear Loaded Story"
                            <span class="settings-row-hint">The 🧹 button in the bottom toolbar.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-show-clear-btn">
                                <span id="settings-show-clear-btn-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-show-copy-btn">
                            Show "Copy Content"
                            <span class="settings-row-hint">The 📋 button in the bottom toolbar.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-show-copy-btn">
                                <span id="settings-show-copy-btn-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-show-download-btn">
                            Show "Download File"
                            <span class="settings-row-hint">The ⬇ button in the bottom toolbar.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-show-download-btn">
                                <span id="settings-show-download-btn-state">On</span>
                            </label>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-show-clear-progress-btn">
                            Show "Clear Saved Progress"
                            <span class="settings-row-hint">The 🗑 button in the session controls.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-show-clear-progress-btn">
                                <span id="settings-show-clear-progress-btn-state">On</span>
                            </label>
                        </span>
                    </div>

                    <h3>🧹 Clear Loaded Story</h3>
                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-clear-story-full-reset">
                            Also clear saved reading position and offline cache
                            <span class="settings-row-hint">When enabled, "Clear Loaded Story" forgets where you were and deletes the offline copy. Preferences (speed, voice, toggles) are always kept. Off by default.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-clear-story-full-reset">
                                <span id="settings-clear-story-full-reset-state">Off</span>
                            </label>
                        </span>
                    </div>

                    <h3>🔊 Narration</h3>
                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-speed-slider">
                            Speed
                            <span class="settings-row-hint">Adjust the narration rate from 0.5× to 2.0×. Takes effect on the next spoken chunk.</span>
                        </label>
                        <span class="settings-row-control">
                            <input type="range" id="settings-speed-slider" min="0.5" max="2" step="0.05">
                            <span class="settings-value" id="settings-speed-readout">1.10×</span>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-voice-select">
                            Voice
                            <span class="settings-row-hint">Choose from the voices installed on your device.</span>
                        </label>
                        <span class="settings-row-control">
                            <select id="settings-voice-select" disabled>
                                <option value="">— Default —</option>
                            </select>
                        </span>
                    </div>

                    <div class="settings-row">
                        <label class="settings-row-label" for="settings-screen-awake">
                            Screen Awake
                            <span class="settings-row-hint">Ask the device to keep the screen on while narration is playing.</span>
                        </label>
                        <span class="settings-row-control">
                            <label class="settings-toggle">
                                <input type="checkbox" id="settings-screen-awake">
                                <span id="settings-screen-awake-state">On</span>
                            </label>
                        </span>
                    </div>

                    <span class="settings-hint">Press the Settings button again to close this panel and return to your content.</span>
                </div>
                `;
            }

            function buildSettingsVoiceDropdown() {
                const voiceSel = document.getElementById('settings-voice-select');
                if (!voiceSel) return;

                voiceSel.innerHTML = '';
                const def = document.createElement('option');
                def.value = '';
                def.textContent = '— Default —';
                voiceSel.appendChild(def);

                const sorted = [...availableVoices].sort((a, b) => {
                    const aG = a.name.includes('Google') ? 0 : 1;
                    const bG = b.name.includes('Google') ? 0 : 1;
                    if (aG !== bG) return aG - bG;
                    return a.name.localeCompare(b.name);
                });

                sorted.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = availableVoices.indexOf(voice);
                    const lang = voice.lang || '';
                    option.textContent = `${voice.name} (${lang})${voice.default ? ' ★' : ''}`;
                    voiceSel.appendChild(option);
                });

                voiceSel.disabled = availableVoices.length === 0;
                voiceSel.value = selectedVoiceIndex;
            }

            function syncSettingsUI() {
                const $ = (id) => document.getElementById(id);

                const ignoreCutoff = $('settings-ignore-cutoff');
                if (ignoreCutoff) {
                    ignoreCutoff.checked = ignoreCutoffMarker;
                    $('settings-ignore-cutoff-state').textContent = ignoreCutoffMarker ? 'On' : 'Off';
                }

                const includeScene = $('settings-include-scene-headers');
                if (includeScene) {
                    includeScene.checked = includeSceneHeaders;
                    $('settings-include-scene-headers-state').textContent = includeSceneHeaders ? 'On' : 'Off';
                }
                const includeEp = $('settings-include-episode-headers');
                if (includeEp) {
                    includeEp.checked = includeEpisodeHeaders;
                    $('settings-include-episode-headers-state').textContent = includeEpisodeHeaders ? 'On' : 'Off';
                }
                const includeVol = $('settings-include-volume-headers');
                if (includeVol) {
                    includeVol.checked = includeVolumeHeaders;
                    $('settings-include-volume-headers-state').textContent = includeVolumeHeaders ? 'On' : 'Off';
                }
                const copyHeader = $('settings-copy-include-header');
                if (copyHeader) {
                    copyHeader.checked = copyIncludeHeader;
                    $('settings-copy-include-header-state').textContent = copyIncludeHeader ? 'On' : 'Off';
                }
                const screenAwake = $('settings-screen-awake');
                if (screenAwake) {
                    screenAwake.checked = screenAwakeEnabled;
                    $('settings-screen-awake-state').textContent = screenAwakeEnabled ? 'On' : 'Off';
                }
                const speed = $('settings-speed-slider');
                if (speed) speed.value = playbackRate;
                const speedReadoutEl = $('settings-speed-readout');
                if (speedReadoutEl) speedReadoutEl.textContent = playbackRate.toFixed(2) + '×';

                const su = $('settings-show-upload-btn');
                if (su) { su.checked = showUploadBtn; $('settings-show-upload-btn-state').textContent = showUploadBtn ? 'On' : 'Off'; }
                const ss = $('settings-show-server-btn');
                if (ss) { ss.checked = showServerBtn; $('settings-show-server-btn-state').textContent = showServerBtn ? 'On' : 'Off'; }
                const sc = $('settings-show-clear-btn');
                if (sc) { sc.checked = showClearBtn;  $('settings-show-clear-btn-state').textContent  = showClearBtn  ? 'On' : 'Off'; }
                const sy = $('settings-show-copy-btn');
                if (sy) { sy.checked = showCopyBtn;   $('settings-show-copy-btn-state').textContent   = showCopyBtn   ? 'On' : 'Off'; }
                const sd = $('settings-show-download-btn');
                if (sd) { sd.checked = showDownloadBtn; $('settings-show-download-btn-state').textContent = showDownloadBtn ? 'On' : 'Off'; }
                const cf = $('settings-clear-story-full-reset');
                if (cf) { cf.checked = clearStoryAlsoClearsProgress; $('settings-clear-story-full-reset-state').textContent = clearStoryAlsoClearsProgress ? 'On' : 'Off'; }
                const scp = $('settings-show-clear-progress-btn');
                if (scp) { scp.checked = showClearProgressBtn; $('settings-show-clear-progress-btn-state').textContent = showClearProgressBtn ? 'On' : 'Off'; }

                buildSettingsVoiceDropdown();
            }

            function attachSettingsListeners() {
                const $ = (id) => document.getElementById(id);

                const ignoreCutoff = $('settings-ignore-cutoff');
                if (ignoreCutoff && !ignoreCutoff.dataset.bound) {
                    ignoreCutoff.dataset.bound = '1';
                    ignoreCutoff.addEventListener('change', function() {
                        ignoreCutoffMarker = this.checked;
                        $('settings-ignore-cutoff-state').textContent = ignoreCutoffMarker ? 'On' : 'Off';
                        savePreferences();
                        if (currentStoryText) {
                            logDebug(`Cutoff marker: ignore=${ignoreCutoffMarker}; re-parsing loaded story.`);
                            loadStoryFromText(currentStoryText, loadRequestId);
                        }
                    });
                }

                const showUpload = $('settings-show-upload-btn');
                if (showUpload && !showUpload.dataset.bound) {
                    showUpload.dataset.bound = '1';
                    showUpload.addEventListener('change', function() {
                        showUploadBtn = this.checked;
                        $('settings-show-upload-btn-state').textContent = showUploadBtn ? 'On' : 'Off';
                        savePreferences();
                        applyBottomButtonVisibility();
                    });
                }

                const showServer = $('settings-show-server-btn');
                if (showServer && !showServer.dataset.bound) {
                    showServer.dataset.bound = '1';
                    showServer.addEventListener('change', function() {
                        showServerBtn = this.checked;
                        $('settings-show-server-btn-state').textContent = showServerBtn ? 'On' : 'Off';
                        savePreferences();
                        applyBottomButtonVisibility();
                    });
                }

                const showClear = $('settings-show-clear-btn');
                if (showClear && !showClear.dataset.bound) {
                    showClear.dataset.bound = '1';
                    showClear.addEventListener('change', function() {
                        showClearBtn = this.checked;
                        $('settings-show-clear-btn-state').textContent = showClearBtn ? 'On' : 'Off';
                        savePreferences();
                        applyBottomButtonVisibility();
                    });
                }

                const showCopy = $('settings-show-copy-btn');
                if (showCopy && !showCopy.dataset.bound) {
                    showCopy.dataset.bound = '1';
                    showCopy.addEventListener('change', function() {
                        showCopyBtn = this.checked;
                        $('settings-show-copy-btn-state').textContent = showCopyBtn ? 'On' : 'Off';
                        savePreferences();
                        applyBottomButtonVisibility();
                    });
                }

                const showDownload = $('settings-show-download-btn');
                if (showDownload && !showDownload.dataset.bound) {
                    showDownload.dataset.bound = '1';
                    showDownload.addEventListener('change', function() {
                        showDownloadBtn = this.checked;
                        $('settings-show-download-btn-state').textContent = showDownloadBtn ? 'On' : 'Off';
                        savePreferences();
                        applyBottomButtonVisibility();
                    });
                }

                const clearFullReset = $('settings-clear-story-full-reset');
                if (clearFullReset && !clearFullReset.dataset.bound) {
                    clearFullReset.dataset.bound = '1';
                    clearFullReset.addEventListener('change', function() {
                        clearStoryAlsoClearsProgress = this.checked;
                        $('settings-clear-story-full-reset-state').textContent = clearStoryAlsoClearsProgress ? 'On' : 'Off';
                        savePreferences();
                    });
                }

                const showClearProgress = $('settings-show-clear-progress-btn');
                if (showClearProgress && !showClearProgress.dataset.bound) {
                    showClearProgress.dataset.bound = '1';
                    showClearProgress.addEventListener('change', function() {
                        showClearProgressBtn = this.checked;
                        $('settings-show-clear-progress-btn-state').textContent = showClearProgressBtn ? 'On' : 'Off';
                        savePreferences();
                        applyBottomButtonVisibility();
                    });
                }

                const includeScene = $('settings-include-scene-headers');
                if (includeScene && !includeScene.dataset.bound) {
                    includeScene.dataset.bound = '1';
                    includeScene.addEventListener('change', function() {
                        includeSceneHeaders = this.checked;
                        $('settings-include-scene-headers-state').textContent = includeSceneHeaders ? 'On' : 'Off';
                        savePreferences();
                        if (isWholeModeActive()) displaySelectedScene(false);
                    });
                }

                const includeEp = $('settings-include-episode-headers');
                if (includeEp && !includeEp.dataset.bound) {
                    includeEp.dataset.bound = '1';
                    includeEp.addEventListener('change', function() {
                        includeEpisodeHeaders = this.checked;
                        $('settings-include-episode-headers-state').textContent = includeEpisodeHeaders ? 'On' : 'Off';
                        savePreferences();
                        if (isWholeModeActive()) displaySelectedScene(false);
                    });
                }

                const includeVol = $('settings-include-volume-headers');
                if (includeVol && !includeVol.dataset.bound) {
                    includeVol.dataset.bound = '1';
                    includeVol.addEventListener('change', function() {
                        includeVolumeHeaders = this.checked;
                        $('settings-include-volume-headers-state').textContent = includeVolumeHeaders ? 'On' : 'Off';
                        savePreferences();
                        if (isWholeModeActive()) displaySelectedScene(false);
                    });
                }

                const copyHeader = $('settings-copy-include-header');
                if (copyHeader && !copyHeader.dataset.bound) {
                    copyHeader.dataset.bound = '1';
                    copyHeader.addEventListener('change', function() {
                        copyIncludeHeader = this.checked;
                        $('settings-copy-include-header-state').textContent = copyIncludeHeader ? 'On' : 'Off';
                        savePreferences();
                    });
                }

                const screenAwake = $('settings-screen-awake');
                if (screenAwake && !screenAwake.dataset.bound) {
                    screenAwake.dataset.bound = '1';
                    screenAwake.addEventListener('change', function() {
                        screenAwakeEnabled = this.checked;
                        $('settings-screen-awake-state').textContent = screenAwakeEnabled ? 'On' : 'Off';
                        savePreferences();
                        if (!screenAwakeEnabled) {
                            releaseWakeLock();
                        } else if (ttsActive && !ttsPaused) {
                            requestWakeLock();
                        }
                    });
                }

                const speed = $('settings-speed-slider');
                if (speed && !speed.dataset.bound) {
                    speed.dataset.bound = '1';
                    speed.addEventListener('input', function() {
                        playbackRate = parseFloat(this.value);
                        updateSpeedReadout();
                        savePreferences();
                        if (speedSlider) speedSlider.value = playbackRate;
                    });
                }

                const voiceSel = $('settings-voice-select');
                if (voiceSel && !voiceSel.dataset.bound) {
                    voiceSel.dataset.bound = '1';
                    voiceSel.addEventListener('change', function() {
                        selectedVoiceIndex = voiceSel.value;
                        if (voiceSelect) voiceSelect.value = selectedVoiceIndex;
                        savePreferences();
                        logDebug(`Voice: selected index ${selectedVoiceIndex || '(default)'}`);
                    });
                }
            }

            function enterHelpMode() {
                if (settingsVisible) exitSettingsMode(true);

                resumeAutoStart = ttsActive;
                resumeChunkIndex = currentChunkIndex;

                pauseNarrationForPanel();

                contentArea.innerHTML = `
                    <h2 class="scene-title">📚 Help — ${escapeHtml(STORY_TITLE)} Reader</h2>
                    <div class="scene-content help-panel-wrapper">${helpHTML()}</div>
                `;
                sceneContentEl = null;

                helpVisible = true;
                helpBtn.classList.add('help-active');
                helpBtn.textContent = '✕ Close Help';
                setStatus('Showing help — press Help again to return.');

                updateSceneNavButtons();
            }

            function enterSettingsMode() {
                if (helpVisible) exitHelpMode(true);

                resumeAutoStart = ttsActive;
                resumeChunkIndex = currentChunkIndex;

                pauseNarrationForPanel();

                contentArea.innerHTML = `
                    <h2 class="scene-title">⚙️ Settings — ${escapeHtml(STORY_TITLE)} Reader</h2>
                    <div class="scene-content settings-panel-wrapper">${settingsHTML()}</div>
                `;
                sceneContentEl = null;

                settingsVisible = true;
                settingsBtn.classList.add('settings-active');
                settingsBtn.textContent = '✕ Close Settings';
                setStatus('Showing settings — press Settings again to return.');

                syncSettingsUI();
                attachSettingsListeners();
                updateSceneNavButtons();
            }

            function pauseNarrationForPanel() {
                if (!ttsActive) return;
                clearResumeTimer();
                clearPendingPause();
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                if (currentUtterance) {
                    currentUtterance.onend = null;
                    currentUtterance.onerror = null;
                }
                currentUtterance = null;
                ttsActive = false;
                ttsPaused = false;
                speakBtn.textContent = '🔊 Speak Scene';
                pauseBtn.textContent = '⏸ Pause';
                setTtsButtonsActive(false);
                releaseWakeLock();
                cancelAutoplayCountdown();
            }

            function exitHelpMode(silent) {
                helpVisible = false;
                helpBtn.classList.remove('help-active');
                helpBtn.textContent = '❓ Help';
                restoreContentAfterPanel(silent);
            }

            function exitSettingsMode(silent) {
                settingsVisible = false;
                settingsBtn.classList.remove('settings-active');
                settingsBtn.textContent = '⚙️ Settings';
                restoreContentAfterPanel(silent);
            }

            function restoreContentAfterPanel(silent) {
                showContent(currentSceneName, currentSceneText, false, currentSceneHeader);

                if (resumeAutoStart) {
                    chunks = chunkText(currentSceneText, CHUNK_MAX_LEN);
                    if (chunks.length > 0) {
                        ttsActive = true;
                        ttsPaused = false;
                        speakBtn.textContent = '🔊 Speaking...';
                        pauseBtn.textContent = '⏸ Pause';
                        setTtsButtonsActive(true);
                        setNarrationActiveClass(true);
                        startResumeTimer();
                        requestWakeLock();

                        const startIdx = (resumeChunkIndex >= 0 && resumeChunkIndex < chunks.length)
                            ? resumeChunkIndex
                            : 0;
                        if (!silent) setStatus(`Resumed: ${currentSceneName} (${playbackRate.toFixed(2)}×)`);
                        setTimeout(function() { playChunkAt(startIdx); }, 150);
                    }
                } else {
                    if (!silent) setStatus(`Reading: ${currentSceneName}`);
                }

                resumeChunkIndex = -1;
                resumeAutoStart = false;
            }

            helpBtn.addEventListener('click', function() {
                if (helpVisible) exitHelpMode(false); else enterHelpMode();
            });
            settingsBtn.addEventListener('click', function() {
                if (settingsVisible) exitSettingsMode(false); else enterSettingsMode();
            });

            /* ========== SPEECH SYNTHESIS ========== */

            function pickPreferredVoiceIndex() {
                if (availableVoices.length === 0) return -1;

                const exactIdx = availableVoices.findIndex(
                    v => v.name === 'Google UK English Male'
                );
                if (exactIdx >= 0) {
                    logDebug(`Preferred voice found: "${availableVoices[exactIdx].name}"`);
                    return exactIdx;
                }

                const fuzzyIdx = availableVoices.findIndex(v => {
                    const n = (v.name || '').toLowerCase();
                    return n.includes('google') && n.includes('uk') && n.includes('male');
                });
                if (fuzzyIdx >= 0) {
                    logDebug(`Preferred voice matched fuzzily: "${availableVoices[fuzzyIdx].name}"`);
                    return fuzzyIdx;
                }

                const englishIdx = availableVoices.findIndex(
                    v => (v.lang || '').toLowerCase().startsWith('en')
                );
                if (englishIdx >= 0) {
                    logDebug(`Falling back to first English voice: "${availableVoices[englishIdx].name}"`);
                    return englishIdx;
                }

                const defaultIdx = availableVoices.findIndex(v => v.default);
                if (defaultIdx >= 0) {
                    logDebug(`Falling back to default voice: "${availableVoices[defaultIdx].name}"`);
                    return defaultIdx;
                }

                logDebug(`Falling back to first available voice: "${availableVoices[0].name}"`);
                return 0;
            }

            function populateVoiceList() {
                if (!window.speechSynthesis) {
                    logDebug('SpeechSynthesis not supported in this browser');
                    speakBtn.disabled = true;
                    return;
                }

                availableVoices = window.speechSynthesis.getVoices();
                logDebug(`Voices available: ${availableVoices.length}`);

                if (selectedVoiceIndex === '') {
                    const preferredIdx = pickPreferredVoiceIndex();
                    if (preferredIdx >= 0) selectedVoiceIndex = String(preferredIdx);
                }

                if (voiceSelect) {
                    voiceSelect.innerHTML = '';
                    const defaultOption = document.createElement('option');
                    defaultOption.value = '';
                    defaultOption.textContent = '— Default —';
                    voiceSelect.appendChild(defaultOption);

                    const sorted = [...availableVoices].sort((a, b) => {
                        const aG = a.name.includes('Google') ? 0 : 1;
                        const bG = b.name.includes('Google') ? 0 : 1;
                        if (aG !== bG) return aG - bG;
                        return a.name.localeCompare(b.name);
                    });

                    sorted.forEach(function(voice) {
                        const option = document.createElement('option');
                        option.value = availableVoices.indexOf(voice);
                        const lang = voice.lang || '';
                        option.textContent = `${voice.name} (${lang})${voice.default ? ' ★' : ''}`;
                        voiceSelect.appendChild(option);
                    });

                    voiceSelect.disabled = false;
                    voiceSelect.value = selectedVoiceIndex;
                }

                if (settingsVisible) buildSettingsVoiceDropdown();
            }

            if (window.speechSynthesis) {
                speechSynthesis.onvoiceschanged = populateVoiceList;
                populateVoiceList();
            } else {
                logDebug('Web Speech API not available');
                speakBtn.disabled = true;
                pauseBtn.disabled = true;
                prevBtn.disabled = true;
                replayBtn.disabled = true;
                nextBtn.disabled = true;
                stopBtn.disabled = true;
                autoplayBtn.disabled = true;
                if (voiceSelect) voiceSelect.disabled = true;
            }

            if (voiceSelect) {
                voiceSelect.addEventListener('change', function() {
                    selectedVoiceIndex = voiceSelect.value;
                    savePreferences();
                });
            }
            loadPreferences();
            updateSpeedReadout();
            updateAutoplayButton();

            /* ========== CHUNKER ========== */

            function chunkText(text, maxLen) {
                if (!text) return [];
                if (!maxLen) maxLen = CHUNK_MAX_LEN;

                const rawLines = text.split('\n');
                const chunks = [];
                let lastWasPause = false;

                for (let li = 0; li < rawLines.length; li++) {
                    const rawLine = rawLines[li];
                    const trimmed = rawLine.trim();

                    if (trimmed === '') {
                        if (!lastWasPause) {
                            chunks.push({
                                text: '',
                                isPause: true,
                                lineIndex: li
                            });
                            lastWasPause = true;
                        }
                        continue;
                    }

                    lastWasPause = false;

                    if (isDividerLine(trimmed)) {
                        chunks.push({
                            text: trimmed,
                            isPause: false,
                            isDivider: true,
                            lineIndex: li
                        });
                        continue;
                    }

                    if (trimmed.length <= maxLen) {
                        chunks.push({
                            text: trimmed,
                            isPause: false,
                            lineIndex: li
                        });
                        continue;
                    }

                    const sentences = trimmed.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) || [trimmed];
                    let buffer = '';

                    for (const sentence of sentences) {
                        const s = sentence.trim();
                        if (!s) continue;

                        if (s.length > maxLen) {
                            if (buffer) {
                                chunks.push({ text: buffer, isPause: false, lineIndex: li });
                                buffer = '';
                            }
                            let remaining = s;
                            while (remaining.length > maxLen) {
                                let breakAt = remaining.lastIndexOf(', ', maxLen);
                                if (breakAt < maxLen * 0.5) breakAt = remaining.lastIndexOf('; ', maxLen);
                                if (breakAt < maxLen * 0.5) breakAt = remaining.lastIndexOf(' ', maxLen);
                                if (breakAt < maxLen * 0.5) breakAt = maxLen;
                                chunks.push({
                                    text: remaining.slice(0, breakAt + 1).trim(),
                                    isPause: false,
                                    lineIndex: li
                                });
                                remaining = remaining.slice(breakAt + 1).trim();
                            }
                            if (remaining) buffer = remaining;
                        } else if ((buffer + ' ' + s).length > maxLen) {
                            if (buffer) {
                                chunks.push({ text: buffer, isPause: false, lineIndex: li });
                            }
                            buffer = s;
                        } else {
                            buffer = buffer ? buffer + ' ' + s : s;
                        }
                    }
                    if (buffer) {
                        chunks.push({ text: buffer, isPause: false, lineIndex: li });
                    }
                }

                return chunks;
            }

            function clearResumeTimer() {
                if (resumeIntervalId) { clearInterval(resumeIntervalId); resumeIntervalId = null; }
            }

            function clearPendingPause() {
                if (pendingPauseTimeout) { clearTimeout(pendingPauseTimeout); pendingPauseTimeout = null; }
            }

            function startResumeTimer() {
                clearResumeTimer();
                resumeIntervalId = setInterval(function() {
                    if (!window.speechSynthesis.speaking) return;
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                    }
                }, 5000);
            }
            function playChunkAt(index) {
                if (index < 0) index = 0;

                while (
                    index < chunks.length &&
                    chunks[index] &&
                    chunks[index].isDivider
                ) {
                    index++;
                }

                if (index >= chunks.length) {
                    currentChunkIndex = chunks.length;
                    ttsActive = false;
                    ttsPaused = false;
                    speakBtn.textContent = '🔊 Speak Scene';
                    pauseBtn.textContent = '⏸ Pause';
                    setTtsButtonsActive(false);
                    setStatus(`Finished reading: ${currentSceneName}`);
                    logDebug('TTS finished all chunks');
                    clearResumeTimer();
                    updateChunkUI();
                    setNarrationActiveClass(false);
                    releaseWakeLock();

                    if (autoplayEnabled) {
                        const list = getCurrentNavList();
                        const flatIndex = getCurrentNavIndex();
                        if (!wholeSeriesMode && flatIndex >= 0 && flatIndex < list.length - 1) {
                            startAutoplayCountdown();
                        } else {
                            logDebug('Autoplay: no next item available — disabling');
                            setAutoplay(false);
                            setStatus('Autoplay finished — last item reached.');
                        }
                    }

                    return;
                }

                currentChunkIndex = index;
                const chunk = chunks[currentChunkIndex];

                updateChunkUI();

                if (chunk.isPause) {
                    const pauseMs = Math.round(PAUSE_BASE_MS / Math.max(0.5, playbackRate));
                    clearPendingPause();
                    pendingPauseTimeout = setTimeout(function() {
                        pendingPauseTimeout = null;
                        if (ttsActive && !ttsPaused && currentChunkIndex === index) {
                            playChunkAt(index + 1);
                        }
                    }, pauseMs);
                    return;
                }

                const sanitized = sanitizeForSpeech(chunk.text);
                const utterance = new SpeechSynthesisUtterance(sanitized);
                currentUtterance = utterance;

                if (selectedVoiceIndex !== '' && availableVoices[selectedVoiceIndex]) {
                    utterance.voice = availableVoices[selectedVoiceIndex];
                }

                utterance.rate = playbackRate;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                utterance.onend = function() {
                    if (currentUtterance === utterance && ttsActive && !ttsPaused) {
                        playChunkAt(currentChunkIndex + 1);
                    }
                };

                utterance.onerror = function(event) {
                    if (event.error === 'interrupted' || event.error === 'canceled') return;
                    logDebug(`Chunk error: ${event.error} — skipping`);
                    if (currentUtterance === utterance && ttsActive && !ttsPaused) {
                        playChunkAt(currentChunkIndex + 1);
                    }
                };

                window.speechSynthesis.speak(utterance);
            }

            function jumpToChunk(index) {
                if (!window.speechSynthesis || !ttsActive) return;

                clearPendingPause();
                window.speechSynthesis.cancel();
                if (currentUtterance) {
                    currentUtterance.onend = null;
                    currentUtterance.onerror = null;
                    currentUtterance = null;
                }

                ttsPaused = false;
                pauseBtn.textContent = '⏸ Pause';

                setTimeout(function() { playChunkAt(index); }, 80);
            }

            function stopSpeaking() {
                chunks = [];
                currentChunkIndex = -1;
                clearResumeTimer();
                clearPendingPause();
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                if (currentUtterance) {
                    currentUtterance.onend = null;
                    currentUtterance.onerror = null;
                }
                currentUtterance = null;
                ttsActive = false;
                ttsPaused = false;
                speakBtn.textContent = '🔊 Speak Scene';
                pauseBtn.textContent = '⏸ Pause';
                setTtsButtonsActive(false);
                setStatus('Speech stopped.');
                updateChunkUI();
                setNarrationActiveClass(false);
                releaseWakeLock();
                cancelAutoplayCountdown();
            }

            function startSpeaking() {
                if (!currentSceneText) { setStatus('No text to speak.'); return; }
                if (!window.speechSynthesis) { setStatus('Speech synthesis not supported in this browser.', true); return; }

                window.speechSynthesis.cancel();
                clearResumeTimer();
                clearPendingPause();

                chunks = chunkText(currentSceneText, CHUNK_MAX_LEN);
                currentChunkIndex = 0;

                if (chunks.length === 0) { setStatus('Nothing to speak.'); return; }

                ttsActive = true;
                ttsPaused = false;
                speakBtn.textContent = '🔊 Speaking...';
                pauseBtn.textContent = '⏸ Pause';
                setTtsButtonsActive(true);
                setNarrationActiveClass(true);
                setStatus(`Speaking: ${currentSceneName} (${playbackRate.toFixed(2)}×)`);

                requestWakeLock();
                startResumeTimer();
                setTimeout(function() { playChunkAt(0); }, 100);
            }

            function togglePause() {
                if (!window.speechSynthesis || !ttsActive) return;

                if (ttsPaused) {
                    window.speechSynthesis.resume();
                    ttsPaused = false;
                    pauseBtn.textContent = '⏸ Pause';
                    setStatus(`Speaking: ${currentSceneName}`);
                    requestWakeLock();

                    setTimeout(function() {
                        if (ttsActive && !ttsPaused && !window.speechSynthesis.speaking && !pendingPauseTimeout) {
                            playChunkAt(currentChunkIndex);
                        }
                    }, 200);
                } else {
                    window.speechSynthesis.pause();
                    ttsPaused = true;
                    pauseBtn.textContent = '▶ Resume';
                    setStatus(`Paused: ${currentSceneName}`);
                    releaseWakeLock();
                }
            }

            speakBtn.addEventListener('click', function() {
                if (ttsActive) {
                    stopSpeaking();
                    setTimeout(startSpeaking, 150);
                } else {
                    startSpeaking();
                }
            });

            pauseBtn.addEventListener('click', togglePause);
            stopBtn.addEventListener('click', stopSpeaking);

            prevBtn.addEventListener('click', function() {
                if (!ttsActive) return;
                const target = Math.max(0, currentChunkIndex - 1);
                jumpToChunk(target);
            });

            nextBtn.addEventListener('click', function() {
                if (!ttsActive) return;
                const target = Math.min(chunks.length - 1, currentChunkIndex + 1);
                jumpToChunk(target);
            });

            replayBtn.addEventListener('click', function() {
                if (!ttsActive) return;
                if (currentChunkIndex < 0) return;
                jumpToChunk(currentChunkIndex);
            });

            /* ========== END TTS ========== */

            /* ========== RENDERING ========== */

            function stripIndentation(content) {
                if (!content) return '';

                // Strip any cutoff/resume marker lines from the scene body so
                // they can never be rendered, copied, or spoken.
                content = stripCutoffAndResumeMarkers(content);

                const lines = content.split('\n');
                let minIndent = Infinity;

                for (let line of lines) {
                    if (line.trim() !== '') {
                        const match = line.match(/^(\s*)/);
                        const indent = match ? match[1].length : 0;
                        if (indent < minIndent) minIndent = indent;
                    }
                }

                if (minIndent === Infinity || minIndent === 0) return content;

                const strippedLines = lines.map(line => {
                    if (line.trim() === '') return line;
                    return line.substring(minIndent);
                });

                return strippedLines.join('\n');
            }

            function escapeHtml(s) {
                return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            function renderChunkedContent(stripped) {
                const previewChunks = chunkText(stripped, CHUNK_MAX_LEN);
                const rawLines = stripped.split('\n');

                const chunksByLine = new Map();
                previewChunks.forEach((c, idx) => {
                    if (!chunksByLine.has(c.lineIndex)) chunksByLine.set(c.lineIndex, []);
                    chunksByLine.get(c.lineIndex).push(idx);
                });

                let html = '';
                let lastWasPause = false;

                for (let li = 0; li < rawLines.length; li++) {
                    const rawLine = rawLines[li];
                    const trimmed = rawLine.trim();
                    const idxs = chunksByLine.get(li) || [];

                    if (trimmed === '') {
                        if (lastWasPause) continue;
                        const pauseIdx = idxs.find(i => previewChunks[i].isPause);
                        if (pauseIdx === undefined) continue;
                        html += `<p class="pause-paragraph"><span class="chunk-span chunk-pause" data-chunk-index="${pauseIdx}" title="Beat">&nbsp;</span></p>`;
                        lastWasPause = true;
                        continue;
                    }

                    lastWasPause = false;

                    if (trimmed.startsWith(DIVIDER_MARK_PREFIX)) {
                        const rest = trimmed.substring(DIVIDER_MARK_PREFIX.length);
                        const sep = rest.indexOf('\u0001');
                        const kind = sep >= 0 ? rest.substring(0, sep) : '';
                        const name = sep >= 0 ? rest.substring(sep + 1) : rest;
                        html += `<div class="parsed-divider"><span class="pd-scope">${escapeHtml(kind)}</span>${escapeHtml(name)}</div>`;
                        continue;
                    }

                    if (idxs.length === 0) {
                        html += `<p>${escapeHtml(rawLine)}</p>`;
                        continue;
                    }

                    html += '<p>';
                    for (let k = 0; k < idxs.length; k++) {
                        const ci = idxs[k];
                        const c = previewChunks[ci];
                        if (c.isPause) continue;
                        if (k > 0) html += ' ';
                        html += `<span class="chunk-span" data-chunk-index="${ci}">${escapeHtml(c.text)}</span>`;
                    }
                    html += '</p>';
                }

                return html;
            }

            function showContent(title, content, autoStart, explicitHeader) {
                if (!content) {
                    contentArea.innerHTML = `<div class="message">No content available for this selection.</div>`;
                    currentSceneText = '';
                    currentSceneHeader = '';
                    sceneContentEl = null;
                    speakBtn.disabled = true;
                    pauseBtn.disabled = true;
                    prevBtn.disabled = true;
                    replayBtn.disabled = true;
                    nextBtn.disabled = true;
                    copySceneBtn.disabled = true;
                    if (downloadStoryBtn) downloadStoryBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                const html = renderChunkedContent(content);

                contentArea.innerHTML = `
                    <h2 class="scene-title">${escapeHtml(title || 'Untitled Scene')}</h2>
                    <div class="scene-content" id="scene-content">${html}</div>
                `;

                sceneContentEl = document.getElementById('scene-content');
                attachChunkInteractions(sceneContentEl);

                currentSceneName = title || 'Untitled Scene';
                currentSceneText = content;
                currentSceneHeader = explicitHeader || ('SCENE - ' + currentSceneName);
                speakBtn.disabled = false;

                if (ttsActive) stopSpeaking();
                updateSceneNavButtons();

                if (autoStart) {
                    setTimeout(function() { startSpeaking(); }, 150);
                }
            }

            function attachChunkInteractions(container) {
                if (!container) return;
                container.addEventListener('click', function(e) {
                    if (!ttsActive) return;
                    const span = e.target.closest('.chunk-span');
                    if (!span) return;
                    const idx = parseInt(span.getAttribute('data-chunk-index'), 10);
                    if (isNaN(idx)) return;
                    jumpToChunk(idx);
                });
            }

            /* ========== SELECT HELPERS ========== */

            function populateSelect(select, items, defaultLabel) {
                const currentValue = select.value;
                select.innerHTML = '';

                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = defaultLabel || '— Select —';
                defaultOption.disabled = true;
                defaultOption.selected = true;
                select.appendChild(defaultOption);

                if (!items || items.length === 0) {
                    select.disabled = true;
                    return;
                }

                select.disabled = false;
                items.forEach(item => {
                    const option = document.createElement('option');
                    if (typeof item === 'object' && item !== null && 'id' in item) {
                        option.value = item.id;
                        option.textContent = item.label;
                    } else {
                        option.value = item;
                        option.textContent = item;
                    }
                    select.appendChild(option);
                });

                if (items.length > 0) {
                    if (currentValue) {
                        const optionExists = Array.from(select.options).some(opt => opt.value === currentValue);
                        if (optionExists) { select.value = currentValue; return; }
                    }
                    if (select.options.length > 1) select.selectedIndex = 1;
                }
            }

            /* ========== PARSER ========== */

            function extractName(tagLine) {
                let name = tagLine.replace(/^(VOLUME|EPISODE|SCENE)\s*[:—-]?\s*/, '');
                name = name.trim();
                if (!name || name === tagLine.trim()) return null;
                return name;
            }

            function getIndentLevel(line) {
                const match = line.match(/^(\s*)/);
                return match ? match[1].length : 0;
            }

            function removeTrailingSceneName(content, sceneIndentLevel) {
                if (!content) return '';

                const lines = content.split('\n');

                while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

                if (lines.length > 0) {
                    const lastLine = lines[lines.length - 1];
                    const lastIndent = getIndentLevel(lastLine);

                    if (lastIndent <= sceneIndentLevel &&
                        !lastLine.trim().startsWith('SCENE') &&
                        !lastLine.trim().startsWith('EPISODE') &&
                        !lastLine.trim().startsWith('VOLUME')) {
                        lines.pop();
                        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
                    }
                }

                return lines.join('\n');
            }
            function parseStory(text) {
                logDebug('=== Starting parse ===');
                const lines = text.split(/\r?\n/);

                const volumes = [];
                let currentVolume = null;
                let currentEpisode = null;
                let currentScene = null;
                let sceneContent = [];
                let inScene = false;
                let sceneIndentLevel = 0;
                let redacting = false;   // true while inside a //// ... \\\\ region

                let volumeCount = 0;
                let episodeCount = 0;
                let sceneCount = 0;

                function saveScene() {
                    if (inScene && currentScene && currentEpisode) {
                        let content = sceneContent.join('\n').trimEnd();
                        content = removeTrailingSceneName(content, sceneIndentLevel);
                        content = stripCutoffAndResumeMarkers(content);
                        currentEpisode.scenes.push({
                            id: `scene-tmp-${Date.now()}-${Math.random()}`,
                            name: currentScene,
                            content: content
                        });
                        sceneContent = [];
                        inScene = false;
                    }
                }

                function saveEpisode() {
                    saveScene();
                    if (currentEpisode && currentVolume) {
                        const exists = currentVolume.episodes.some(e => e.id === currentEpisode.id);
                        if (!exists) currentVolume.episodes.push(currentEpisode);
                        currentEpisode = null;
                    }
                }

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();

                    // ── Cutoff marker ──
                    // Starts a redacted region. If the reader enabled "Ignore cutoff
                    // marker", this is a no-op. A region ends at the next RESUME
                    // marker, or runs to EOF if there is none.
                    if (trimmed === CUTOFF_MARKER) {
                        if (ignoreCutoffMarker) {
                            logDebug(`Parser: ignoring cutoff marker at line ${i}.`);
                        } else {
                            logDebug(`Parser: entering redacted region at line ${i}.`);
                            redacting = true;
                        }
                        continue;
                    }

                    // ── Resume marker ──
                    // Ends a redacted region (and is a harmless no-op outside one).
                    if (trimmed === RESUME_MARKER) {
                        if (redacting) logDebug(`Parser: leaving redacted region at line ${i}.`);
                        redacting = false;
                        continue;
                    }

                    // While redacting, skip all content but keep scanning for the
                    // resume marker so structural parsing (VOLUME/EPISODE/SCENE
                    // boundaries) still flushes correctly when we come out the other
                    // side.
                    if (redacting) continue;

                    if (trimmed === '') {
                        if (inScene && currentScene) sceneContent.push(line);
                        continue;
                    }

                    if (trimmed.startsWith('VOLUME')) {
                        volumeCount++; episodeCount = 0; sceneCount = 0;
                        saveEpisode();
                        const volumeName = extractName(trimmed) || `Volume ${volumes.length}`;
                        currentVolume = { name: volumeName, episodes: [] };
                        volumes.push(currentVolume);
                        continue;
                    }

                    if (trimmed.startsWith('EPISODE')) {
                        episodeCount++; sceneCount = 0;
                        saveEpisode();
                        if (!currentVolume) {
                            currentVolume = { name: 'Volume 1', episodes: [] };
                            volumes.push(currentVolume);
                        }
                        let episodeName = extractName(trimmed);
                        if (!episodeName && i + 1 < lines.length) {
                            const nextLine = lines[i + 1].trim();
                            const isDivider = /^_+$/.test(nextLine);
                            if (nextLine && !isDivider &&
                                !nextLine.startsWith('EPISODE') &&
                                !nextLine.startsWith('SCENE') &&
                                !nextLine.startsWith('VOLUME')) {
                                episodeName = nextLine;
                                i++;
                            }
                        }
                        if (!episodeName) episodeName = `Episode ${episodeCount}`;
                        currentEpisode = {
                            id: `episode-tmp-${Date.now()}-${Math.random()}`,
                            name: episodeName,
                            scenes: []
                        };
                        continue;
                    }

                    if (trimmed.startsWith('SCENE')) {
                        sceneCount++;
                        saveScene();
                        if (!currentEpisode) {
                            if (!currentVolume) {
                                currentVolume = { name: 'Volume 1', episodes: [] };
                                volumes.push(currentVolume);
                            }
                            currentEpisode = {
                                id: `episode-tmp-${Date.now()}-${Math.random()}`,
                                name: `Episode ${currentVolume.episodes.length + 1}`,
                                scenes: []
                            };
                        }

                        sceneIndentLevel = getIndentLevel(line);
                        let sceneName = extractName(trimmed);
                        if (!sceneName) sceneName = `Scene ${sceneCount}`;

                        currentScene = sceneName;
                        sceneContent = [];
                        inScene = true;
                        continue;
                    }

                    if (inScene && currentScene) {
                        if (trimmed !== '______________________________' &&
                            !trimmed.startsWith('SCENE') &&
                            !trimmed.startsWith('EPISODE') &&
                            !trimmed.startsWith('VOLUME')) {
                            sceneContent.push(line);
                        }
                    }
                }

                if (inScene && currentScene && currentEpisode) {
                    let content = sceneContent.join('\n').trimEnd();
                    content = removeTrailingSceneName(content, sceneIndentLevel);
                    content = stripCutoffAndResumeMarkers(content);
                    currentEpisode.scenes.push({
                        id: `scene-tmp-${Date.now()}-${Math.random()}`,
                        name: currentScene,
                        content: content
                    });
                    sceneContent = [];
                    inScene = false;
                }

                saveEpisode();

                volumes.forEach(volume => {
                    volume.episodes.forEach(episode => {
                        episode.scenes.forEach(scene => {
                            const lines = scene.content.split('\n');
                            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
                            if (lines.length > 0) {
                                const lastLine = lines[lines.length - 1];
                                const lastIndent = getIndentLevel(lastLine);
                                if (lastIndent < 4 && lastLine.trim().length < 60) {
                                    const trimmed = lastLine.trim();
                                    if (!trimmed.startsWith('"') &&
                                        !trimmed.startsWith("'") &&
                                        !trimmed.match(/[.,!?;:]/) &&
                                        !trimmed.startsWith('SCENE') &&
                                        !trimmed.startsWith('EPISODE') &&
                                        !trimmed.startsWith('VOLUME')) {
                                        lines.pop();
                                        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
                                        scene.content = lines.join('\n');
                                    }
                                }
                            }
                        });
                    });
                });

                volumes.forEach((volume, volumeIndex) => {
                    volume.episodes.forEach((episode, episodeIndex) => {
                        episode.id = `episode-${volumeIndex}-${episodeIndex}`;
                        episode.scenes.forEach((scene, sceneIndex) => {
                            scene.id = `scene-${volumeIndex}-${episodeIndex}-${sceneIndex}`;
                        });
                    });
                });

                // If we ended the file while still inside a redacted region, the story
                // was truncated (a //// with no matching \\\\).
                const cutoffReached = redacting;

                return { volumes, cutoffReached };
            }

            /* ========== WHOLE-* TOGGLE GLUE ========== */

            function applyWholeTogglesFromState() {
                if (wholeSeriesMode) { wholeVolumeMode = false; wholeEpisodeMode = false; }
                else if (wholeVolumeMode) { wholeSeriesMode = false; wholeEpisodeMode = false; }
                else if (wholeEpisodeMode) { wholeSeriesMode = false; wholeVolumeMode = false; }

                wholeSeriesToggle.checked = wholeSeriesMode;
                wholeVolumeToggle.checked = wholeVolumeMode;
                wholeEpisodeToggle.checked = wholeEpisodeMode;

                sceneSelect.disabled = isWholeModeActive();
                episodeSelect.disabled = wholeSeriesMode;
                volumeSelect.disabled = false;

                applyBottomButtonVisibility();
            }

            wholeEpisodeToggle.addEventListener('change', function() {
                wholeEpisodeMode = this.checked;
                if (wholeEpisodeMode) { wholeVolumeMode = false; wholeSeriesMode = false; }
                applyWholeTogglesFromState();
                savePreferences();
                if (storyData && volumeSelect.value && episodeSelect.value) displaySelectedScene(autoplayEnabled);
                updateSceneNavButtons();
            });

            wholeVolumeToggle.addEventListener('change', function() {
                wholeVolumeMode = this.checked;
                if (wholeVolumeMode) { wholeEpisodeMode = false; wholeSeriesMode = false; }
                applyWholeTogglesFromState();
                savePreferences();
                if (storyData && volumeSelect.value) displaySelectedScene(autoplayEnabled);
                updateSceneNavButtons();
            });

            wholeSeriesToggle.addEventListener('change', function() {
                wholeSeriesMode = this.checked;
                if (wholeSeriesMode) { wholeEpisodeMode = false; wholeVolumeMode = false; }
                applyWholeTogglesFromState();
                savePreferences();
                if (storyData && storyData.volumes.length) displaySelectedScene(autoplayEnabled);
                updateSceneNavButtons();
            });

            /* ========== AUTO-SELECT & NAV UPDATE ========== */

            function autoSelectFirstScene() {
                if (!storyData || !storyData.volumes.length) return;
                let targetVolume = storyData.volumes[0];
                let targetEpisode = targetVolume.episodes[0];
                let targetScene = targetEpisode && targetEpisode.scenes[0];
                const resume = pendingResumeProgress;
                let restoredResume = false;

                if (resume && (resume.wholeSeries || resume.wholeVolume || resume.wholeEpisode)) {
                    wholeSeriesMode = !!resume.wholeSeries;
                    wholeVolumeMode = !!resume.wholeVolume;
                    wholeEpisodeMode = !!resume.wholeEpisode;
                    applyWholeTogglesFromState();
                }

                if (resume) {
                    const rv = storyData.volumes.find(v => v.name === resume.volume);
                    let re = rv && rv.episodes.find(e => e.id === resume.episode);
                    let rs = re && re.scenes.find(sc => sc.id === resume.scene);

                    if (rv && (resume.wholeSeries || resume.wholeVolume || resume.wholeEpisode)) {
                        if (re || !resume.episode) {
                            targetVolume = rv;
                            if (resume.episode && re) targetEpisode = re;
                            targetScene = targetEpisode && targetEpisode.scenes[0];
                            restoredResume = true;
                        }
                    } else if (rv && re && rs) {
                        targetVolume = rv; targetEpisode = re; targetScene = rs;
                        restoredResume = true;
                    } else if (rv && !rs && resume.sceneName) {
                        for (const episode of rv.episodes) {
                            const scene = episode.scenes.find(sc => sc.name === resume.sceneName);
                            if (scene) { re = episode; rs = scene; break; }
                        }
                        if (rs) {
                            targetVolume = rv; targetEpisode = re; targetScene = rs;
                            restoredResume = true;
                        }
                    }
                }
                if (!targetVolume) return;

                cascadingSelectChange = true;
                volumeSelect.value = targetVolume.name;
                populateSelect(episodeSelect, targetVolume.episodes.map((e, i) => ({ id: e.id, label: `${i + 1} - ${e.name}` })), '— Select Episode —');
                episodeSelect.disabled = wholeSeriesMode;
                if (targetEpisode) episodeSelect.value = targetEpisode.id;

                if (targetEpisode) {
                    populateSelect(sceneSelect, targetEpisode.scenes.map((sc, i) => ({ id: sc.id, label: `${i + 1} - ${sc.name}` })), '— Select Scene —');
                    sceneSelect.disabled = isWholeModeActive();
                    if (targetScene) sceneSelect.value = targetScene.id;
                }
                cascadingSelectChange = false;

                const wasResumed = restoredResume;
                pendingResumeProgress = null;
                displaySelectedScene(false);
                if (wasResumed) showResumeBanner(resume);
                updateSceneNavButtons();
            }

            function updateNavigation() {
                if (!storyData || !storyData.volumes.length) return;

                const volumeLabels = storyData.volumes.map((v, index) => ({
                    id: v.name,
                    label: `${index} - ${v.name}`
                }));
                populateSelect(volumeSelect, volumeLabels, '— Select Volume —');
                volumeSelect.disabled = false;

                populateSelect(episodeSelect, [], '— Select Episode —');
                populateSelect(sceneSelect, [], '— Select Scene —');
                let loadedMsg = `Loaded ${storyData.volumes.length} volume(s).`;
                if (storyData.cutoffReached && !ignoreCutoffMarker) {
                    loadedMsg += ' Content truncated at cutoff marker — enable "Ignore cutoff marker" in Settings to load the rest.';
                }
                setStatus(loadedMsg);
                speakBtn.disabled = true;
                chunks = [];
                currentChunkIndex = -1;
                ttsActive = false;
                setTtsButtonsActive(false);
                updateChunkUI();
                currentSceneText = '';
                updateSceneNavButtons();

                autoplayBtn.disabled = false;

                autoSelectFirstScene();
            }

            function updateEpisodes() {
                const selectedVolume = volumeSelect.value;

                if (!selectedVolume || !storyData) {
                    populateSelect(episodeSelect, [], '— Select Episode —');
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    contentArea.innerHTML = `<div class="message">Select a volume to begin reading.</div>`;
                    speakBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                const volume = storyData.volumes.find(v => v.name === selectedVolume);
                if (!volume) {
                    populateSelect(episodeSelect, [], '— Select Episode —');
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    updateSceneNavButtons();
                    return;
                }

                const episodeLabels = volume.episodes.map((e, index) => ({
                    id: e.id,
                    label: `${index + 1} - ${e.name}`
                }));
                populateSelect(episodeSelect, episodeLabels, '— Select Episode —');
                populateSelect(sceneSelect, [], '— Select Scene —');
                contentArea.innerHTML = `<div class="message">Select an episode to view its scenes.</div>`;
                speakBtn.disabled = true;
                chunks = [];
                currentChunkIndex = -1;
                ttsActive = false;
                setTtsButtonsActive(false);
                updateChunkUI();
                currentSceneText = '';
                updateSceneNavButtons();

                if (volume.episodes.length > 0) {
                    episodeSelect.value = volume.episodes[0].id;
                    updateScenes();
                }
            }

            function updateScenes() {
                const selectedVolume = volumeSelect.value;
                const selectedEpisodeId = episodeSelect.value;

                if (!selectedVolume || !selectedEpisodeId || !storyData) {
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    contentArea.innerHTML = `<div class="message">Select an episode to view its scenes.</div>`;
                    speakBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                const volume = storyData.volumes.find(v => v.name === selectedVolume);
                if (!volume) { populateSelect(sceneSelect, [], '— Select Scene —'); updateSceneNavButtons(); return; }

                const episode = volume.episodes.find(e => e.id === selectedEpisodeId);
                if (!episode) { populateSelect(sceneSelect, [], '— Select Scene —'); updateSceneNavButtons(); return; }

                const sceneItems = episode.scenes.map((s, index) => ({
                    id: s.id,
                    label: `${index + 1} - ${s.name}`
                }));
                populateSelect(sceneSelect, sceneItems, '— Select Scene —');
                sceneSelect.disabled = isWholeModeActive();
                speakBtn.disabled = true;
                chunks = [];
                currentChunkIndex = -1;
                ttsActive = false;
                setTtsButtonsActive(false);
                updateChunkUI();
                currentSceneText = '';
                updateSceneNavButtons();

                if (episode.scenes.length > 0) {
                    sceneSelect.value = episode.scenes[0].id;
                    displaySelectedScene(autoplayEnabled);
                } else {
                    contentArea.innerHTML = `<div class="message">Select a scene to read.</div>`;
                }
            }

            function displaySelectedScene(autoStart) {
                if (helpVisible) exitHelpMode(true);
                if (settingsVisible) exitSettingsMode(true);

                const built = buildCurrentContent();
                if (!built) {
                    contentArea.innerHTML = `<div class="message">Please make a selection.</div>`;
                    speakBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                if (volumeSelect.value && episodeSelect.value) saveReadingProgress();

                showContent(built.title, built.body, !!autoStart, built.header);

                chunks = [];
                currentChunkIndex = -1;
                ttsActive = false;
                setTtsButtonsActive(false);
                updateChunkUI();
                updateSceneNavButtons();

                setStatus(`Reading: ${built.header}`);
            }

            volumeSelect.addEventListener('change', function() {
                if (cascadingSelectChange) return;
                updateEpisodes();
            });

            episodeSelect.addEventListener('change', function() {
                if (cascadingSelectChange) return;
                updateScenes();
            });

            sceneSelect.addEventListener('change', function() {
                if (cascadingSelectChange) return;
                displaySelectedScene(autoplayEnabled);
            });

            /* ========== STORY LOADING ========== */

            function resetNavigationControls() {
                volumeSelect.innerHTML = '<option value="">— Loading —</option>';
                volumeSelect.disabled = false;
                episodeSelect.innerHTML = '<option value="">— Select Episode —</option>';
                episodeSelect.disabled = true;
                sceneSelect.innerHTML = '<option value="">— Select Scene —</option>';
                sceneSelect.disabled = true;
            }

            function clearActiveStory(reason) {
                loadRequestId++;

                if (window.speechSynthesis) window.speechSynthesis.cancel();
                clearResumeTimer();
                clearPendingPause();
                cancelAutoplayCountdown();
                releaseWakeLock();

                currentUtterance = null;
                ttsActive = false;
                ttsPaused = false;
                chunks = [];
                currentChunkIndex = -1;
                currentSceneName = '';
                currentSceneText = '';
                currentSceneHeader = '';
                sceneContentEl = null;
                storyData = null;
                currentStoryText = '';

                speakBtn.textContent = '🔊 Speak Scene';
                pauseBtn.textContent = '⏸ Pause';
                setTtsButtonsActive(false);
                updateChunkUI();

                if (fileInput) fileInput.value = '';
                fileLoadArea.classList.remove('visible');
                resetNavigationControls();

                contentArea.innerHTML = `<div class="message"><p>${reason || 'No story loaded yet.'}</p></div>`;

                updateSceneNavButtons();
            }

            function loadStoryFromText(text, requestId) {
                if (requestId !== undefined && requestId !== loadRequestId) return;

                try {
                    const parsed = parseStory(text);
                    storyData = parsed;
                    currentStoryFingerprint = makeStoryFingerprint(text);
                    currentStoryText = text;
                    pendingResumeProgress = getSavedProgress();

                    if (!storyData.volumes || storyData.volumes.length === 0) {
                        throw new Error('No volumes found in the file.');
                    }

                    if (storyData.cutoffReached && !ignoreCutoffMarker) {
                        logDebug('Story loaded with cutoff marker — remaining content withheld.');
                    }

                    updateNavigation();
                    let loadedMsg = `Loaded ${storyData.volumes.length} volume(s).`;
                    if (storyData.cutoffReached && !ignoreCutoffMarker) {
                        loadedMsg += ' Content truncated at cutoff marker — enable "Ignore cutoff marker" in Settings to load the rest.';
                    }
                    setStatus(loadedMsg);
                    fileLoadArea.classList.remove('visible');
                } catch (error) {
                    console.error('Error:', error);
                    contentArea.innerHTML = `<div class="error"><strong>Error loading story:</strong><br>${error.message}</div>`;
                    setStatus('Error loading story.', true);
                }
            }

            function hasActiveReadingProgress() {
                return !!(storyData && (getCurrentNavIndex() >= 0 || currentSceneText));
            }

            function confirmStoryReplacement(label) {
                if (!hasActiveReadingProgress()) return true;
                return confirm(`${label} will replace the currently loaded story. Your saved reading position will remain available. Continue?`);
            }

            function openFilePicker() {
                if (!confirmStoryReplacement('Loading from your computer')) return;
                serverFetchDisabled = true;
                clearActiveStory('Choose a .txt file from your computer.');
                fileLoadArea.classList.add('visible');
                setStatus('📂 Manual upload selected — choose the story .txt file.');
                fileInput.click();
            }

            fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (!file) return;

                const requestId = ++loadRequestId;
                serverFetchDisabled = true;
                setStatus(`Loading ${file.name}...`);
                const reader = new FileReader();

                reader.onload = function(event) {
                    if (requestId !== loadRequestId || !serverFetchDisabled) return;
                    currentStorySource = `local:${file.name}`;
                    cacheStoryText(event.target.result, currentStorySource);
                    loadStoryFromText(event.target.result, requestId);
                };

                reader.onerror = function() {
                    if (requestId !== loadRequestId) return;
                    setStatus('Error reading file.', true);
                };

                reader.readAsText(file);
            });

            async function loadStoryFromServer(explicit) {
                if (!confirmStoryReplacement('Reloading from the server')) return;

                // Password gate — only blocks the explicit server-load path.
                if (explicit && isServerGateEnabled() && !(await ensureServerGateUnlocked())) {
                    return;
                }

                serverFetchDisabled = false;
                clearActiveStory('Fetching the latest story from the server...');
                const requestId = loadRequestId;

                setStatus('Loading latest story file from server...');

                const cacheBuster = `${STORY_FILE}${STORY_FILE.includes('?') ? '&' : '?'}_=${Date.now()}`;

                fetch(cacheBuster, { cache: 'no-store' })
                    .then(response => {
                        if (requestId !== loadRequestId) throw new Error('Server fetch superseded by another load request.');
                        if (!response.ok) throw new Error(`HTTP ${response.status}: Could not fetch '${STORY_FILE}'`);
                        return response.text();
                    })
                    .then(text => {
                        if (requestId !== loadRequestId || serverFetchDisabled) return;
                        currentStorySource = 'server';
                        cacheStoryText(text, currentStorySource);
                        loadStoryFromText(text, requestId);
                    })
                    .catch(error => {
                        if (requestId !== loadRequestId) return;

                        if (!explicit) {
                            const cached = getCachedStory();
                            if (cached) {
                                currentStorySource = cached.source || 'offline-cache';
                                const cacheDate = new Date(cached.savedAt).toLocaleString();
                                setStatus(`⚠️ Server unavailable — using cached story from ${cacheDate}.`);
                                loadStoryFromText(cached.text, requestId);
                                return;
                            }
                        }

                        fileLoadArea.classList.add('visible');
                        setStatus('📂 Server fetch failed — please select the story file manually.');

                        contentArea.innerHTML = `
                            <div class="message">
                                <p>📂 No story loaded yet.</p>
                                <p style="font-size: 0.9rem; color: #8b949e; margin-top: 10px;">
                                    Click <strong>Choose File</strong> above or <strong>Load from Computer</strong> below and select:<br>
                                    <code style="background: #21262d; padding: 2px 8px; border-radius: 4px;">${STORY_FILE}</code>
                                </p>
                            </div>
                        `;
                    });
            }

            function clearLoadedStory() {
                if (!hasActiveReadingProgress()) {
                    setStatus('No story is currently loaded.');
                    return;
                }

                const label = clearStoryAlsoClearsProgress
                    ? 'Clearing the loaded story, saved reading position, and offline cache'
                    : 'Clearing the loaded story';

                if (!confirmStoryReplacement(label)) return;

                if (clearStoryAlsoClearsProgress) {
                    // Full reset: also forget reading position and delete offline cache.
                    clearSavedProgress(false);
                    try { localStorage.removeItem(STORAGE_KEYS.storyCache); } catch (e) {}
                    logDebug('Clear Loaded Story: also cleared saved progress + offline cache (per pref).');
                }

                clearActiveStory('No story loaded. Use “Load from Computer” or “Reload from Server” to begin.');
                setStatus(clearStoryAlsoClearsProgress
                    ? 'Loaded story, saved reading position, and offline cache all cleared.'
                    : 'Loaded story cleared. Saved reading position preserved.');
                fileLoadArea.classList.add('visible');
            }

            uploadSourceBtn.addEventListener('click', openFilePicker);
            serverSourceBtn.addEventListener('click', function() { loadStoryFromServer(true); });
            clearStoryBtn.addEventListener('click', clearLoadedStory);

            /* ========== BOOT ========== */

            loadPreferences();
            applyWholeTogglesFromState();
            applyBottomButtonVisibility();

            if (isServerGateEnabled() && !readGateSession()) {
                const cached = getCachedStory();
                if (cached) {
                    // Cache exists — show it silently, no prompt. Reader can
                    // click "Reload from Server" later if they want fresh.
                    currentStorySource = cached.source || 'offline-cache';
                    const cacheDate = new Date(cached.savedAt).toLocaleString();
                    setStatus(`🔒 Server access requires a password. Using cached story from ${cacheDate}.`);
                    loadStoryFromText(cached.text, loadRequestId);
                } else {
                    // No cache to fall back on — this is a first-time visit with
                    // the gate on. Prompt now, because otherwise there's nothing
                    // to read and the reader has to guess that they should click
                    // "Reload from Server".
                    setStatus('🔒 Server access requires a password.');
                    (async function() {
                        const unlocked = await ensureServerGateUnlocked();
                        if (unlocked) {
                            // ensureServerGateUnlocked already wrote the session
                            // flag, so loadStoryFromServer(false) won't re-prompt.
                            loadStoryFromServer(false);
                        } else {
                            // Cancelled or wrong password — leave the reader with
                            // the local-load fallback and a clear status message.
                            clearActiveStory('🔒 Server access requires a password. Enter the password via “Reload from Server”, or load the story from your computer.');
                            fileLoadArea.classList.add('visible');
                        }
                    })();
                }
            } else {
                loadStoryFromServer(false);
            }

        })();