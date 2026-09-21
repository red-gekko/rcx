/* ========================================================= */
/* Generated page JavaScript                                  */
/* The original script order has been preserved.             */
/* ========================================================= */


/* --------------------------------------------------------- */
/* Original script 1: index.html */
/* --------------------------------------------------------- */


        (function() {
            'use strict';

            const STORY_FILE = 'bloodhound story scenes-WIP.txt';
            const PAUSE_BASE_MS = 500;
            const AUTOPLAY_DELAY_SEC = 2;
            const CHUNK_MAX_LEN = 320;
            const STORAGE_KEYS = { preferences: 'bloodhoundReader.preferences.v1', progress: 'bloodhoundReader.progress.v1', storyCache: 'bloodhoundReader.storyCache.v1' };
            let pendingResumeProgress = null;
            let currentStoryFingerprint = '';
            let currentStorySource = '';

            const volumeSelect = document.getElementById('volume-select');
            const episodeSelect = document.getElementById('episode-select');
            const sceneSelect = document.getElementById('scene-select');
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
            const focusBtn = document.getElementById('focus-btn');
            const resumeBanner = document.getElementById('resume-banner');
            const clearProgressBtn = document.getElementById('clear-progress-btn');
            const voiceSelect = document.getElementById('voice-select');
            const chunkCounter = document.getElementById('chunk-counter');
            const chunkPanel = document.getElementById('chunk-panel');
            const chunkPanelText = document.getElementById('chunk-panel-text');
            const speedSlider = document.getElementById('speed-slider');
            const speedReadout = document.getElementById('speed-readout');

            const autoplayTimer = document.getElementById('autoplayTimer');
            const timerCountdown = document.getElementById('timerCountdown');
            const cancelAutoplayBtn = document.getElementById('cancelAutoplayBtn');

            const scenePrevBtn = document.getElementById('scene-prev-btn');
            const sceneNextBtn = document.getElementById('scene-next-btn');
            const sceneNavSpacer = document.getElementById('scene-nav-spacer');
            const scenePrevBtnBottom = document.getElementById('scene-prev-btn-bottom');
            const sceneNextBtnBottom = document.getElementById('scene-next-btn-bottom');
            const sceneNavSpacerBottom = document.getElementById('scene-nav-spacer-bottom');
            const uploadSourceBtn = document.getElementById('upload-source-btn');
            const serverSourceBtn = document.getElementById('server-source-btn');
            const clearStoryBtn = document.getElementById('clear-story-btn');
            const wakeLockIndicator = document.getElementById('wake-lock-indicator');

            let availableVoices = [];
            let chunks = [];
            let currentChunkIndex = -1;
            let currentUtterance = null;
            let resumeIntervalId = null;
            let pendingPauseTimeout = null;
            let ttsActive = false;
            let ttsPaused = false;
            let currentSceneName = '';
            let currentSceneText = '';
            let playbackRate = 1.1;

            let autoplayEnabled = false;
            let autoplayTimerId = null;
            let autoplayCountdown = 0;
            let autoplayWaiting = false;

            let cascadingSelectChange = false;

            // The reader starts in server mode. Choosing the computer option switches
            // this session to manual-upload mode, so it will not immediately try the
            // server again. "Reload from Server" explicitly switches back.
            let serverFetchDisabled = false;
            let loadRequestId = 0;

            let sceneContentEl = null;

            // ── Help-mode state ──
            let helpVisible = false;
            let resumeChunkIndex = -1;
            let resumeAutoStart = false;

            let storyData = null;
            let debugLog = [];

            // ── Screen Wake Lock state ──
            let wakeLockSentinel = null;
            let wakeLockSupported = ('wakeLock' in navigator);
            let wakeLockRequestPending = false;

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
                    if (Number.isFinite(prefs.playbackRate) && prefs.playbackRate >= 0.5 && prefs.playbackRate <= 2) { playbackRate = prefs.playbackRate; speedSlider.value = playbackRate; }
                    if (typeof prefs.autoplayEnabled === 'boolean') autoplayEnabled = prefs.autoplayEnabled;
                } catch (e) { console.warn('Preference restore failed:', e); }
            }
            function savePreferences() {
                const v = voiceSelect.value !== '' && availableVoices[voiceSelect.value] ? availableVoices[voiceSelect.value] : null;
                storageSet(STORAGE_KEYS.preferences, JSON.stringify({ playbackRate, autoplayEnabled, voiceName: v ? v.name : '', voiceLang: v ? v.lang : '' }));
            }
            function getSavedProgress() {
                try { const raw = storageGet(STORAGE_KEYS.progress); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
            }
            function saveReadingProgress() {
                if (!storyData || !currentStoryFingerprint || !volumeSelect.value || !episodeSelect.value || !sceneSelect.value) return;
                storageSet(STORAGE_KEYS.progress, JSON.stringify({ fingerprint: currentStoryFingerprint, volume: volumeSelect.value, episode: episodeSelect.value, scene: sceneSelect.value, flatIndex: getCurrentFlatIndex(), sceneName: currentSceneName, savedAt: Date.now() }));
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
                if (!progress || !progress.sceneName) return;
                resumeBanner.innerHTML = `↩ Resumed from <strong>${escapeHtml(progress.sceneName)}</strong>`;
                resumeBanner.classList.add('visible');
                setTimeout(() => resumeBanner.classList.remove('visible'), 1000);
            }
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
                if (!wakeLockSupported) {
                    logDebug('Wake Lock API not supported in this browser — screen may sleep during narration.');
                    return;
                }
                if (wakeLockSentinel && !wakeLockSentinel.released) {
                    // Already held — nothing to do.
                    updateWakeLockIndicator();
                    return;
                }
                if (wakeLockRequestPending) {
                    return;
                }
                if (document.visibilityState !== 'visible') {
                    // The API rejects requests while the page is hidden; the
                    // visibilitychange handler will retry when we come back.
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
                        // The system can release the lock at any time (e.g. low
                        // battery). If narration is still running, try again so
                        // we don't silently lose the lock mid-scene.
                        if (ttsActive && !ttsPaused && document.visibilityState === 'visible') {
                            setTimeout(requestWakeLock, 1000);
                        }
                    });
                } catch (err) {
                    // Common causes: low battery, power-save mode, HTTPS
                    // requirement, or the tab isn't focused. Not fatal.
                    logDebug(`Wake Lock: request failed — ${err.name || 'Error'}: ${err.message || err}`);
                } finally {
                    wakeLockRequestPending = false;
                    updateWakeLockIndicator();
                }
            }

            async function releaseWakeLock() {
                if (!wakeLockSentinel) {
                    updateWakeLockIndicator();
                    return;
                }
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

            // Browsers automatically release the wake lock when the page is
            // hidden. When the user returns to the tab while narration is still
            // active, we must re-acquire it ourselves.
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'visible') {
                    if (ttsActive && !ttsPaused) {
                        logDebug('Wake Lock: page visible again — re-acquiring.');
                        requestWakeLock();
                    }
                } else {
                    logDebug('Wake Lock: page hidden — lock will be released by the system.');
                    updateWakeLockIndicator();
                }
            });

            if (!wakeLockSupported) {
                logDebug('Wake Lock API unavailable — screen may turn off during long narration.');
            }

            /* ========== SPEECH TEXT SANITIZER ========== */

            // Removes or replaces characters that the Web Speech API reads
            // literally (asterisks, brackets, hashes, dashes, etc.) without
            // altering what is displayed in the reader.
            function sanitizeForSpeech(text) {
                if (!text) return '';

                let s = text;

                // Markdown emphasis markers — remove entirely
                s = s.replace(/\*{2,}/g, ' ');     // *** runs → pause
                s = s.replace(/\*/g, '');          // single * → removed
                s = s.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2'); // _italic_ → italic
                s = s.replace(/_{2,}/g, ' ');      // __ runs → pause
                s = s.replace(/~/g, '');           // strikethrough markers
                s = s.replace(/`/g, '');           // code ticks
                s = s.replace(/\^/g, '');          // carets

                // Brackets — remove the brackets, keep the content
                s = s.replace(/\[([^\]]*)\]/g, '$1'); // [text] → text
                s = s.replace(/\{([^}]*)\}/g, '$1');  // {text} → text
                s = s.replace(/[\[\]\{\}]/g, '');     // stragglers

                // Parentheses — replace with comma-style pauses
                s = s.replace(/\(/g, ', ');
                s = s.replace(/\)/g, ', ');

                // Hashes and pipes
                s = s.replace(/#/g, ' ');
                s = s.replace(/\|/g, ', ');
                s = s.replace(/\s*\/\s*/g, ' or ');

                // Dashes — em/en dash → comma pause (TTS sometimes says "dash")
                s = s.replace(/[—–]/g, ', ');

                // Angle brackets
                s = s.replace(/[<>]/g, '');

                // Normalise fancy quotes (some voices handle them poorly)
                s = s.replace(/[“”]/g, '"');
                s = s.replace(/[‘’]/g, "'");

                // Ellipses → proper single character
                s = s.replace(/\.{3,}/g, '…');

                // Clean up comma pileups and orphaned punctuation
                s = s.replace(/\s*,\s*,+/g, ', ');
                s = s.replace(/,\s*([.!?])/g, '$1');
                s = s.replace(/\s{2,}/g, ' ');
                s = s.replace(/\s+([.,!?;:])/g, '$1');
                s = s.replace(/^\s*[,;:]\s*/, '');
                s = s.replace(/\s*[,;:]\s*$/, '');

                return s.trim();
            }

            /* ========== SPEED SLIDER ========== */

            function updateSpeedReadout() {
                speedReadout.textContent = playbackRate.toFixed(2) + '×';
            }

            speedSlider.addEventListener('input', function() {
                playbackRate = parseFloat(this.value);
                updateSpeedReadout();
                logDebug(`Playback speed set to ${playbackRate.toFixed(2)}×`);
                savePreferences();
            });

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
                        const list = getFlatSceneList();
                        const flatIndex = getCurrentFlatIndex();
                        if (flatIndex >= 0 && flatIndex < list.length - 1) {
                            startAutoplayCountdown();
                        } else {
                            logDebug('Autoplay: no next scene available — disabling');
                            setAutoplay(false);
                            setStatus('Autoplay: last scene reached.');
                        }
                    }
                }
            }

            function startAutoplayCountdown() {
                if (!autoplayEnabled) return;
                if (autoplayTimerId) {
                    clearInterval(autoplayTimerId);
                    autoplayTimerId = null;
                }

                autoplayCountdown = AUTOPLAY_DELAY_SEC;
                timerCountdown.textContent = autoplayCountdown;
                autoplayWaiting = true;

                chunkPanel.classList.add('autoplay-waiting');
                chunkPanelText.textContent = `Next scene starting in ${AUTOPLAY_DELAY_SEC} seconds…`;
                chunkPanelText.classList.add('is-autoplay-wait');
                chunkPanelText.classList.remove('is-empty', 'is-pause');
                autoplayTimer.style.display = 'flex';

                logDebug(`Autoplay: countdown started (${AUTOPLAY_DELAY_SEC}s)`);

                autoplayTimerId = setInterval(function() {
                    autoplayCountdown--;
                    timerCountdown.textContent = autoplayCountdown;
                    chunkPanelText.textContent = `Next scene starting in ${autoplayCountdown} second${autoplayCountdown === 1 ? '' : 's'}…`;
                    logDebug(`Autoplay: ${autoplayCountdown}s remaining`);

                    if (autoplayCountdown <= 0) {
                        clearInterval(autoplayTimerId);
                        autoplayTimerId = null;
                        autoplayTimer.style.display = 'none';
                        autoplayWaiting = false;
                        chunkPanel.classList.remove('autoplay-waiting');
                        chunkPanelText.classList.remove('is-autoplay-wait');

                        logDebug('Autoplay: countdown complete — advancing scene');

                        if (autoplayEnabled) {
                            goToNextScene(true);
                        }
                    }
                }, 1000);
            }

            function cancelAutoplayCountdown() {
                if (autoplayTimerId) {
                    clearInterval(autoplayTimerId);
                    autoplayTimerId = null;
                }
                autoplayWaiting = false;
                autoplayTimer.style.display = 'none';
                chunkPanel.classList.remove('autoplay-waiting');
                chunkPanelText.classList.remove('is-autoplay-wait');
                logDebug('Autoplay: countdown cancelled');
                refreshChunkPanelIdleMessage();
            }

            cancelAutoplayBtn.addEventListener('click', function() {
                setAutoplay(false);
                setStatus('Autoplay cancelled.');
            });

            autoplayBtn.addEventListener('click', function() {
                setAutoplay(!autoplayEnabled);
                setStatus(autoplayEnabled
                    ? 'Autoplay enabled — will advance after each scene.'
                    : 'Autoplay disabled.');
            });

            /* ========== UI STATE HELPERS ========== */

            function refreshChunkPanelIdleMessage() {
                if (autoplayWaiting) return;

                if (chunks.length > 0 &&
                    currentChunkIndex >= 0 &&
                    currentChunkIndex < chunks.length) {
                    const c = chunks[currentChunkIndex];
                    if (c.isPause) {
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

            /* ========== SCENE NAVIGATION ========== */

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
                                sceneId: sc.id
                            });
                        });
                    });
                });
                return list;
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
                sceneSelect.disabled = false;

                sceneSelect.value = target.sceneId;

                cascadingSelectChange = false;

                displaySelectedScene(autoStart);
                updateSceneNavButtons();

                logDebug(`Navigated to flat index ${flatIndex}: "${target.sceneName}"${autoStart ? ' (auto-start)' : ''}`);
            }

            function goToPrevScene() {
                const flatIndex = getCurrentFlatIndex();
                if (flatIndex <= 0) {
                    logDebug('Already at first scene — cannot go back further');
                    return;
                }
                selectSceneByFlatIndex(flatIndex - 1, autoplayEnabled);
            }

            function goToNextScene(autoStart) {
                const flatIndex = getCurrentFlatIndex();
                const list = getFlatSceneList();
                if (flatIndex < 0 || flatIndex >= list.length - 1) {
                    logDebug('Already at last scene — cannot go forward');
                    return;
                }
                selectSceneByFlatIndex(flatIndex + 1, !!autoStart);
            }

            function updateSceneNavButtons() {
                const list = getFlatSceneList();
                if (list.length === 0) {
                    scenePrevBtn.disabled = true;
                    sceneNextBtn.disabled = true;
                    sceneNavSpacer.textContent = '—';
                    scenePrevBtnBottom.disabled = true;
                    sceneNextBtnBottom.disabled = true;
                    sceneNavSpacerBottom.textContent = '—';
                    return;
                }

                const flatIndex = getCurrentFlatIndex();
                if (flatIndex < 0) {
                    scenePrevBtn.disabled = true;
                    sceneNextBtn.disabled = true;
                    sceneNavSpacer.textContent = '—';
                    scenePrevBtnBottom.disabled = true;
                    sceneNextBtnBottom.disabled = true;
                    sceneNavSpacerBottom.textContent = '—';
                    return;
                }

                const prevDisabled = (flatIndex <= 0);
                const nextDisabled = (flatIndex >= list.length - 1);

                scenePrevBtn.disabled = prevDisabled;
                sceneNextBtn.disabled = nextDisabled;
                scenePrevBtnBottom.disabled = prevDisabled;
                sceneNextBtnBottom.disabled = nextDisabled;

                const item = list[flatIndex];
                const positionText = `${flatIndex + 1} / ${list.length} — ${item.volumeName} · ${item.episodeName}`;
                sceneNavSpacer.textContent = positionText;
                sceneNavSpacerBottom.textContent = positionText;
            }

            function handlePrevSceneNavigation() {
                logDebug('Scene nav: Previous');
                goToPrevScene();
            }

            function handleNextSceneNavigation() {
                logDebug('Scene nav: Next');
                goToNextScene(autoplayEnabled);
            }

            scenePrevBtn.addEventListener('click', handlePrevSceneNavigation);
            scenePrevBtnBottom.addEventListener('click', handlePrevSceneNavigation);
            sceneNextBtn.addEventListener('click', handleNextSceneNavigation);
            sceneNextBtnBottom.addEventListener('click', handleNextSceneNavigation);

            /* ========== HELP ========== */

            const HELP_HTML = `
                <div class="help-panel">
                    <h3>📄 Site Pages</h3>
                    <ul>
                        <li><a href="legal.html" rel="noopener">Legal Disclaimer &amp; Contact</a> — Full legal disclaimer, copyright and IP information, and a contact form for legal or licensing enquiries.</li>
                        <li><a href="contentwarning.html" rel="noopener">Content Warning</a> — An in-depth guide to the sensitive content depicted in <em>Bloodhound</em>, including an episode-by-episode breakdown, support resources, and a form to suggest changes.</li>
                        <li><a href="splitter.html" rel="noopener">Splitter</a> — A small tool for splitting the story file into separate episode .txt files, packaged as a downloadable .zip.</li>
                    </ul>
                    <h3>📖 Reading &amp; Navigation</h3>
                    <p>The three dropdowns at the top let you pick a <strong>Volume</strong>, <strong>Episode</strong>, and <strong>Scene</strong>. When a story is loaded, the first available item in each list is chosen automatically.</p>
                    <ul>
                        <li><strong>◀ Previous Scene / Next Scene ▶</strong> — Step through the entire story scene by scene, crossing episode and volume boundaries. If Autoplay is on, the new scene begins narrating immediately.</li>
                        <li><strong>Scene position indicator</strong> — Between the two scene nav buttons, shows your place in the story (e.g. <code>4 / 27 — Volume 1 · Episode 2</code>).</li>
                    </ul>

                    <h3>🔊 Narration</h3>
                    <ul>
                        <li><strong>Speak Scene</strong> — Begin narrating the currently displayed scene from the start.</li>
                        <li><strong>Pause / Resume</strong> — Temporarily halt the narrator without losing your place.</li>
                        <li><strong>Stop</strong> — End narration entirely and reset the chunk counter.</li>
                        <li><strong>Prev / Replay / Next (chunk buttons)</strong> — Skip backward, repeat, or skip forward one spoken chunk at a time. Useful for re-hearing a specific sentence.</li>
                        <li><strong>Speed</strong> — Adjust the narration rate from 0.5× to 2.0×. Takes effect on the next spoken chunk.</li>
                        <li><strong>Voice</strong> — Choose from the voices available on your device. The preferred voice is "Google UK English Male" when installed.</li>
                    </ul>

                    <h3>🔆 Screen Awake</h3>
                    <p>While narration is playing, the reader asks your device to keep the screen on using the Screen Wake Lock API. This prevents your phone or tablet from sleeping mid-scene. The <strong>🔆 Screen Awake</strong> badge appears next to the controls when the lock is active. It is released automatically when you pause, stop, or finish narration, so your device can sleep normally when you're not listening.</p>
                    <p><em>Note:</em> this requires a modern browser (Chrome for Android 84+, Safari on iOS 16.4+, Samsung Internet 14+) and an HTTPS connection. On older browsers the reader will still work, but the screen may dim during long narration.</p>

                    <h3>🔁 Autoplay</h3>
                    <p>Toggle Autoplay on to have the reader automatically advance to the next scene after the current one finishes. A countdown appears in the transcript panel, with a cancel button. Autoplay also starts narration automatically when you change scenes manually via the dropdowns or arrow buttons.</p>

                    <h3>📝 Transcript Panel</h3>
                    <p>The panel above always shows either the chunk currently being spoken, a beat marker for paragraph breaks, or a placeholder when idle. During an Autoplay countdown it shows the remaining seconds.</p>

                    <h3>🖱️ Interactive Chunks</h3>
                    <p>While narration is active, each chunk in the scene becomes clickable. <strong>Hover</strong> over any sentence to see its boundaries; the chunk currently being spoken is highlighted in orange. <strong>Click</strong> a chunk to jump narration to that exact point and continue from there.</p>

                    <h3>📂 Story Source</h3>
                    <ul>
                        <li><strong>Load from Computer</strong> — Clear the currently loaded story and switch this session to manual upload mode. It will not try the server again unless you explicitly choose Reload from Server.</li>
                        <li><strong>Reload from Server</strong> — Clear the currently loaded story and fetch the latest version of the story file, bypassing the browser cache. If the server cannot be reached, this will <em>not</em> silently fall back to a cached copy — you will be prompted to load the story manually instead. (The cache is still used silently on first page load, when the reader is just trying to show you something.)</li>
                        <li><strong>Clear Loaded Story</strong> — Unload the current story from the reader without touching your saved reading position, narration preferences, or offline cache. Use this if you want to stop reading entirely without losing your place. The confirmation warning appears only if a story is currently loaded.</li>
                    </ul>

                    <h3>💾 Reader Convenience</h3>
                    <ul>
                        <li><strong>Remember where you were</strong> — Your last Volume, Episode, and Scene are saved in this browser and restored automatically when the same story version is loaded.</li>
                        <li><strong>Persistent narration settings</strong> — Narration speed, voice choice, and Autoplay are remembered between visits.</li>
                        <li><strong>⛶ Focus Mode</strong> — Hides the surrounding controls and attempts to enter fullscreen for a cleaner reading view. Press <code>Esc</code> to leave fullscreen.</li>
                        <li><strong>Unsaved-progress warning</strong> — Replacing a loaded story asks for confirmation so you don't accidentally wipe out your current reading session.</li>
                        <li><strong>Offline persistence</strong> — The most recently loaded story is cached in your browser. If the server cannot be reached on first page load, the reader will use that cached copy before falling back to manual upload.</li>
                        <li><strong>Clear Saved Progress</strong> — Removes the remembered reading position. Your story cache and narration settings are unaffected.</li>
                    </ul>

                    <h3>❓ Help</h3>
                    <p>Press this button again to return to the scene you were reading. If the narrator was active, it resumes from where it left off.</p>

                    <span class="help-hint">Press the Help button again to close this panel and return to your scene.</span>
                </div>
            `;

            function enterHelpMode() {
                resumeAutoStart = ttsActive;
                resumeChunkIndex = currentChunkIndex;

                logDebug(`Help: entered (ttsActive=${ttsActive}, chunk=${currentChunkIndex})`);

                if (ttsActive) {
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
                }
                cancelAutoplayCountdown();

                contentArea.innerHTML = `
                    <h2 class="scene-title">📚 Help — Bloodhound Reader</h2>
                    <div class="scene-content help-panel-wrapper">${HELP_HTML}</div>
                `;
                sceneContentEl = null;

                helpVisible = true;
                helpBtn.classList.add('help-active');
                helpBtn.textContent = '✕ Close Help';
                setStatus('Showing help — press Help again to return.');
            }

            function exitHelpMode() {
                logDebug(`Help: exited (resumeAutoStart=${resumeAutoStart}, resumeChunk=${resumeChunkIndex})`);

                helpVisible = false;
                helpBtn.classList.remove('help-active');
                helpBtn.textContent = '❓ Help';

                showContent(currentSceneName, currentSceneText, false);

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
                        setStatus(`Resumed: ${currentSceneName} (${playbackRate.toFixed(2)}×)`);
                        setTimeout(function() {
                            playChunkAt(startIdx);
                        }, 150);
                    }
                } else {
                    setStatus(`Reading: ${currentSceneName}`);
                }

                resumeChunkIndex = -1;
                resumeAutoStart = false;
            }

            helpBtn.addEventListener('click', function() {
                if (helpVisible) {
                    exitHelpMode();
                } else {
                    enterHelpMode();
                }
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
                    voiceSelect.disabled = true;
                    return;
                }

                availableVoices = window.speechSynthesis.getVoices();
                logDebug(`Voices available: ${availableVoices.length}`);

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

                let restoredIdx = -1;
                try {
                    const raw = storageGet(STORAGE_KEYS.preferences);
                    const prefs = raw ? JSON.parse(raw) : null;
                    if (prefs && prefs.voiceName) restoredIdx = availableVoices.findIndex(v => v.name === prefs.voiceName && (!prefs.voiceLang || v.lang === prefs.voiceLang));
                } catch (e) {}
                const preferredIdx = restoredIdx >= 0 ? restoredIdx : pickPreferredVoiceIndex();
                if (preferredIdx >= 0) voiceSelect.value = preferredIdx;
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
                voiceSelect.disabled = true;
            }

            voiceSelect.addEventListener('change', savePreferences);
            loadPreferences();
            updateSpeedReadout();
            updateAutoplayButton();

            /* ========== CHUNKER (with line index) ========== */

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
                                chunks.push({
                                    text: buffer,
                                    isPause: false,
                                    lineIndex: li
                                });
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
                                chunks.push({
                                    text: buffer,
                                    isPause: false,
                                    lineIndex: li
                                });
                            }
                            buffer = s;
                        } else {
                            buffer = buffer ? buffer + ' ' + s : s;
                        }
                    }
                    if (buffer) {
                        chunks.push({
                            text: buffer,
                            isPause: false,
                            lineIndex: li
                        });
                    }
                }

                return chunks;
            }

            function clearResumeTimer() {
                if (resumeIntervalId) {
                    clearInterval(resumeIntervalId);
                    resumeIntervalId = null;
                }
            }

            function clearPendingPause() {
                if (pendingPauseTimeout) {
                    clearTimeout(pendingPauseTimeout);
                    pendingPauseTimeout = null;
                }
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
                    // Narration has ended naturally — allow the screen to sleep.
                    releaseWakeLock();

                    if (autoplayEnabled) {
                        const list = getFlatSceneList();
                        const flatIndex = getCurrentFlatIndex();
                        if (flatIndex >= 0 && flatIndex < list.length - 1) {
                            startAutoplayCountdown();
                        } else {
                            logDebug('Autoplay: no next scene available — disabling');
                            setAutoplay(false);
                            setStatus('Autoplay finished — last scene reached.');
                        }
                    }

                    return;
                }

                currentChunkIndex = index;
                const chunk = chunks[currentChunkIndex];

                updateChunkUI();

                if (chunk.isPause) {
                    const pauseMs = Math.round(PAUSE_BASE_MS / Math.max(0.5, playbackRate));
                    logDebug(`Pause chunk ${currentChunkIndex + 1}/${chunks.length} (${pauseMs}ms @ ${playbackRate.toFixed(2)}×)`);

                    clearPendingPause();
                    pendingPauseTimeout = setTimeout(function() {
                        pendingPauseTimeout = null;
                        if (ttsActive && !ttsPaused && currentChunkIndex === index) {
                            playChunkAt(index + 1);
                        }
                    }, pauseMs);
                    return;
                }

                // Sanitize the text before handing it to the speech engine.
                // The displayed chunk (and the transcript panel) still show
                // the original text with all punctuation intact.
                const sanitized = sanitizeForSpeech(chunk.text);
                const utterance = new SpeechSynthesisUtterance(sanitized);
                currentUtterance = utterance;

                if (sanitized !== chunk.text) {
                    logDebug(`Sanitized chunk ${currentChunkIndex + 1}: "${chunk.text.substring(0, 40)}..." → "${sanitized.substring(0, 40)}..."`);
                }

                const selectedVoiceIndex = voiceSelect.value;
                if (selectedVoiceIndex !== '' && availableVoices[selectedVoiceIndex]) {
                    utterance.voice = availableVoices[selectedVoiceIndex];
                }

                utterance.rate = playbackRate;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                utterance.onend = function() {
                    logDebug(`Chunk ${currentChunkIndex + 1}/${chunks.length} done`);
                    if (currentUtterance === utterance && ttsActive && !ttsPaused) {
                        playChunkAt(currentChunkIndex + 1);
                    }
                };

                utterance.onerror = function(event) {
                    if (event.error === 'interrupted' || event.error === 'canceled') {
                        logDebug(`Chunk ${currentChunkIndex + 1} ${event.error}`);
                        return;
                    }
                    logDebug(`Chunk error: ${event.error} — skipping`);
                    if (currentUtterance === utterance && ttsActive && !ttsPaused) {
                        playChunkAt(currentChunkIndex + 1);
                    }
                };

                window.speechSynthesis.speak(utterance);
                logDebug(`Speaking chunk ${currentChunkIndex + 1}/${chunks.length} @ ${playbackRate.toFixed(2)}× (${chunk.text.length} chars)`);
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

                setTimeout(function() {
                    playChunkAt(index);
                }, 80);
            }

            function stopSpeaking() {
                chunks = [];
                currentChunkIndex = -1;
                clearResumeTimer();
                clearPendingPause();
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }
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
                logDebug('TTS: stopped');
                updateChunkUI();
                setNarrationActiveClass(false);

                // Narration is no longer active — release the screen wake lock
                // so the device can sleep normally.
                releaseWakeLock();

                cancelAutoplayCountdown();
            }

            function startSpeaking() {
                if (!currentSceneText) {
                    setStatus('No text to speak.');
                    return;
                }
                if (!window.speechSynthesis) {
                    setStatus('Speech synthesis not supported in this browser.', true);
                    return;
                }

                window.speechSynthesis.cancel();
                clearResumeTimer();
                clearPendingPause();

                chunks = chunkText(currentSceneText, CHUNK_MAX_LEN);
                currentChunkIndex = 0;

                const pauseCount = chunks.filter(c => c.isPause).length;
                const textCount = chunks.length - pauseCount;
                logDebug(`TTS: ${chunks.length} chunks queued (${textCount} text + ${pauseCount} pauses) from ${currentSceneText.length} chars`);

                if (chunks.length === 0) {
                    setStatus('Nothing to speak.');
                    return;
                }

                ttsActive = true;
                ttsPaused = false;
                speakBtn.textContent = '🔊 Speaking...';
                pauseBtn.textContent = '⏸ Pause';
                setTtsButtonsActive(true);
                setNarrationActiveClass(true);
                setStatus(`Speaking: ${currentSceneName} (${playbackRate.toFixed(2)}×)`);

                // Keep the screen awake for the duration of narration. The lock
                // is released in stopSpeaking(), on natural completion, and on
                // pause. It is re-acquired on resume and on tab visibility
                // changes (browsers drop the lock when the page is hidden).
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
                    logDebug('TTS: resumed');
                    // Narration is active again — hold the screen awake.
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
                    logDebug('TTS: paused');
                    // While paused there is no reason to keep the screen awake;
                    // releasing the lock saves battery.
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
                logDebug(`TTS: prev → chunk ${target + 1}`);
                jumpToChunk(target);
            });

            nextBtn.addEventListener('click', function() {
                if (!ttsActive) return;
                const target = Math.min(chunks.length - 1, currentChunkIndex + 1);
                logDebug(`TTS: next → chunk ${target + 1}`);
                jumpToChunk(target);
            });

            replayBtn.addEventListener('click', function() {
                if (!ttsActive) return;
                if (currentChunkIndex < 0) return;
                logDebug(`TTS: replay chunk ${currentChunkIndex + 1}`);
                jumpToChunk(currentChunkIndex);
            });

            /* ========== END TTS ========== */

            function stripIndentation(content) {
                if (!content) return '';

                const lines = content.split('\n');
                let minIndent = Infinity;

                for (let line of lines) {
                    if (line.trim() !== '') {
                        const match = line.match(/^(\s*)/);
                        const indent = match ? match[1].length : 0;
                        if (indent < minIndent) {
                            minIndent = indent;
                        }
                    }
                }

                if (minIndent === Infinity || minIndent === 0) {
                    return content;
                }

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
                    if (!chunksByLine.has(c.lineIndex)) {
                        chunksByLine.set(c.lineIndex, []);
                    }
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

            function showContent(title, content, autoStart) {
                if (!content) {
                    contentArea.innerHTML = `<div class="message">No content available for this selection.</div>`;
                    currentSceneText = '';
                    sceneContentEl = null;
                    speakBtn.disabled = true;
                    pauseBtn.disabled = true;
                    prevBtn.disabled = true;
                    replayBtn.disabled = true;
                    nextBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }
                const stripped = stripIndentation(content);

                const html = renderChunkedContent(stripped);

                contentArea.innerHTML = `
                    <h2 class="scene-title">${escapeHtml(title || 'Untitled Scene')}</h2>
                    <div class="scene-content" id="scene-content">${html}</div>
                `;

                sceneContentEl = document.getElementById('scene-content');
                attachChunkInteractions(sceneContentEl);

                currentSceneName = title || 'Untitled Scene';
                currentSceneText = stripped;
                speakBtn.disabled = false;

                if (ttsActive) {
                    stopSpeaking();
                }
                updateSceneNavButtons();

                if (autoStart) {
                    logDebug('showContent: auto-starting narration');
                    setTimeout(function() {
                        startSpeaking();
                    }, 150);
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
                    logDebug(`Chunk click → jump to chunk ${idx + 1}`);
                    jumpToChunk(idx);
                });
            }

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
                        if (optionExists) {
                            select.value = currentValue;
                            return;
                        }
                    }
                    if (select.options.length > 1) {
                        select.selectedIndex = 1;
                    }
                }
            }

            function extractName(tagLine) {
                let name = tagLine.replace(/^(VOLUME|EPISODE|SCENE)\s*[:—-]?\s*/, '');
                name = name.trim();
                if (!name || name === tagLine.trim()) {
                    return null;
                }
                return name;
            }

            function getIndentLevel(line) {
                const match = line.match(/^(\s*)/);
                return match ? match[1].length : 0;
            }

            function removeTrailingSceneName(content, sceneIndentLevel) {
                if (!content) return '';

                const lines = content.split('\n');

                while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                    lines.pop();
                }

                if (lines.length > 0) {
                    const lastLine = lines[lines.length - 1];
                    const lastIndent = getIndentLevel(lastLine);

                    if (lastIndent <= sceneIndentLevel &&
                        !lastLine.trim().startsWith('SCENE') &&
                        !lastLine.trim().startsWith('EPISODE') &&
                        !lastLine.trim().startsWith('VOLUME')) {
                        lines.pop();
                        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                            lines.pop();
                        }
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

                let volumeCount = 0;
                let episodeCount = 0;
                let sceneCount = 0;

                function saveScene() {
                    if (inScene && currentScene && currentEpisode) {
                        let content = sceneContent.join('\n').trimEnd();
                        content = removeTrailingSceneName(content, sceneIndentLevel);
                        currentEpisode.scenes.push({
                            id: `scene-${Date.now()}-${Math.random()}`,
                            name: currentScene,
                            content: content
                        });
                        sceneContent = [];
                        inScene = false;
                        logDebug(`  Saved scene: "${currentScene}" (${content.length} chars)`);
                    }
                }

                function saveEpisode() {
                    saveScene();
                    if (currentEpisode && currentVolume) {
                        const exists = currentVolume.episodes.some(e => e.id === currentEpisode.id);
                        if (!exists) {
                            currentVolume.episodes.push(currentEpisode);
                            logDebug(`  Saved episode: "${currentEpisode.name}" with ${currentEpisode.scenes.length} scenes`);
                        }
                        currentEpisode = null;
                    }
                }

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();

                    if (trimmed === '') {
                        if (inScene && currentScene) {
                            sceneContent.push(line);
                        }
                        continue;
                    }

                    if (trimmed.startsWith('VOLUME')) {
                        logDebug(`Found VOLUME at line ${i+1}: "${trimmed}"`);
                        volumeCount++;
                        episodeCount = 0;
                        sceneCount = 0;
                        saveEpisode();
                        const volumeName = extractName(trimmed) || `Volume ${volumes.length}`;
                        currentVolume = {
                            name: volumeName,
                            episodes: []
                        };
                        volumes.push(currentVolume);
                        logDebug(`Created volume: "${volumeName}"`);
                        continue;
                    }

                    if (trimmed.startsWith('EPISODE')) {
                        logDebug(`Found EPISODE at line ${i+1}: "${trimmed}"`);
                        episodeCount++;
                        sceneCount = 0;
                        saveEpisode();
                        if (!currentVolume) {
                            currentVolume = {
                                name: 'Volume 1',
                                episodes: []
                            };
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
                                logDebug(`  Using next line as episode name: "${episodeName}"`);
                            }
                        }
                        if (!episodeName) {
                            episodeName = `Episode ${episodeCount}`;
                        }
                        currentEpisode = {
                            id: `episode-${Date.now()}-${Math.random()}`,
                            name: episodeName,
                            scenes: []
                        };
                        logDebug(`Created episode: "${episodeName}"`);
                        continue;
                    }

                    if (trimmed.startsWith('SCENE')) {
                        logDebug(`Found SCENE at line ${i+1}: "${trimmed}"`);
                        sceneCount++;
                        saveScene();
                        if (!currentEpisode) {
                            if (!currentVolume) {
                                currentVolume = {
                                    name: 'Volume 1',
                                    episodes: []
                                };
                                volumes.push(currentVolume);
                            }
                            currentEpisode = {
                                id: `episode-${Date.now()}-${Math.random()}`,
                                name: `Episode ${currentVolume.episodes.length + 1}`,
                                scenes: []
                            };
                            logDebug('Created default episode');
                        }

                        sceneIndentLevel = getIndentLevel(line);
                        logDebug(`  Scene indent level: ${sceneIndentLevel}`);

                        let sceneName = extractName(trimmed);
                        if (!sceneName) {
                            sceneName = `Scene ${sceneCount}`;
                        }

                        currentScene = sceneName;
                        sceneContent = [];
                        inScene = true;
                        logDebug(`Created scene: "${sceneName}" (Scene ${sceneCount})`);
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

                logDebug('=== Final cleanup ===');

                if (inScene && currentScene && currentEpisode) {
                    logDebug(`  Final scene before save: "${currentScene}" with ${sceneContent.length} lines`);
                    let content = sceneContent.join('\n').trimEnd();
                    content = removeTrailingSceneName(content, sceneIndentLevel);
                    currentEpisode.scenes.push({
                        id: `scene-${Date.now()}-${Math.random()}`,
                        name: currentScene,
                        content: content
                    });
                    sceneContent = [];
                    inScene = false;
                    logDebug(`  Final scene saved with cleanup applied`);
                }

                saveEpisode();

                volumes.forEach(volume => {
                    volume.episodes.forEach(episode => {
                        episode.scenes.forEach(scene => {
                            const lines = scene.content.split('\n');
                            while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                                lines.pop();
                            }
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
                                        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                                            lines.pop();
                                        }
                                        scene.content = lines.join('\n');
                                        logDebug(`  Post-cleanup removed trailing name: "${trimmed}" from "${scene.name}"`);
                                    }
                                }
                            }
                        });
                    });
                });

                // Parser-created IDs must be stable across page loads. Reading
                // progress stores these values, so Date.now()/random IDs make a
                // saved position look absent after every reload.
                volumes.forEach((volume, volumeIndex) => {
                    volume.episodes.forEach((episode, episodeIndex) => {
                        episode.id = `episode-${volumeIndex}-${episodeIndex}`;
                        episode.scenes.forEach((scene, sceneIndex) => {
                            scene.id = `scene-${volumeIndex}-${episodeIndex}-${sceneIndex}`;
                        });
                    });
                });

                logDebug(`=== Parse Complete ===`);
                logDebug(`Found ${volumes.length} volumes`);
                volumes.forEach((v, vi) => {
                    logDebug(`  Volume ${vi}: "${v.name}" - ${v.episodes.length} episodes`);
                    v.episodes.forEach((e, ei) => {
                        logDebug(`    Episode ${ei+1}: "${e.name}" - ${e.scenes.length} scenes`);
                        e.scenes.forEach((s, si) => {
                            logDebug(`      Scene ${si+1}: "${s.name}" (${s.content.length} chars)`);
                        });
                    });
                });

                return { volumes };
            }

            function autoSelectFirstScene() {
                if (!storyData || !storyData.volumes.length) return;
                let targetVolume = storyData.volumes[0];
                let targetEpisode = targetVolume.episodes[0];
                let targetScene = targetEpisode && targetEpisode.scenes[0];
                const resume = pendingResumeProgress;
                let restoredResume = false;
                if (resume) {
                    const rv = storyData.volumes.find(v => v.name === resume.volume);
                    // IDs are stable for newly saved progress. The name fallback
                    // also restores progress saved by older builds, whose IDs
                    // were random, before saving it again with stable IDs.
                    let re = rv && rv.episodes.find(e => e.id === resume.episode);
                    let rs = re && re.scenes.find(sc => sc.id === resume.scene);
                    if (rv && !rs && resume.sceneName) {
                        for (const episode of rv.episodes) {
                            const scene = episode.scenes.find(sc => sc.name === resume.sceneName);
                            if (scene) {
                                re = episode;
                                rs = scene;
                                break;
                            }
                        }
                    }
                    if (rv && re && rs) {
                        targetVolume = rv;
                        targetEpisode = re;
                        targetScene = rs;
                        restoredResume = true;
                        logDebug(`Restoring saved position instead of defaulting to first scene: ${rv.name} → ${re.name} → ${rs.name}`);
                    } else {
                        logDebug('Saved reading position no longer exists in this story; falling back to the first available scene.');
                    }
                }
                if (!targetVolume || !targetEpisode || !targetScene) return;
                cascadingSelectChange = true;
                volumeSelect.value = targetVolume.name;
                populateSelect(episodeSelect, targetVolume.episodes.map((e, i) => ({ id:e.id, label:`${i + 1} - ${e.name}` })), '— Select Episode —');
                episodeSelect.disabled = false; episodeSelect.value = targetEpisode.id;
                populateSelect(sceneSelect, targetEpisode.scenes.map((sc, i) => ({ id:sc.id, label:`${i + 1} - ${sc.name}` })), '— Select Scene —');
                sceneSelect.disabled = false; sceneSelect.value = targetScene.id;
                cascadingSelectChange = false;
                const wasResumed = restoredResume;
                pendingResumeProgress = null;
                displaySelectedScene(autoplayEnabled);
                if (wasResumed) showResumeBanner(resume);
                updateSceneNavButtons();
            }

            function updateNavigation() {
                if (!storyData || !storyData.volumes.length) {
                    logDebug('No story data to update navigation');
                    return;
                }

                const volumeLabels = storyData.volumes.map((v, index) => ({
                    id: v.name,
                    label: `${index} - ${v.name}`
                }));
                logDebug(`Updating volume dropdown with: ${volumeLabels.map(v => v.label).join(', ')}`);
                populateSelect(volumeSelect, volumeLabels, '— Select Volume —');
                volumeSelect.disabled = false;

                populateSelect(episodeSelect, [], '— Select Episode —');
                populateSelect(sceneSelect, [], '— Select Scene —');
                setStatus(`Loaded ${storyData.volumes.length} volume(s).`);
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
                logDebug(`updateEpisodes called with: "${selectedVolume}"`);

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
                    logDebug(`Volume not found: "${selectedVolume}"`);
                    populateSelect(episodeSelect, [], '— Select Episode —');
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    updateSceneNavButtons();
                    return;
                }

                const episodeLabels = volume.episodes.map((e, index) => ({
                    id: e.id,
                    label: `${index + 1} - ${e.name}`
                }));
                logDebug(`Found ${episodeLabels.length} episodes for volume "${selectedVolume}"`);
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
                logDebug(`updateScenes called with volume: "${selectedVolume}", episodeId: "${selectedEpisodeId}"`);

                if (!selectedVolume || !selectedEpisodeId || !storyData) {
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    contentArea.innerHTML = `<div class="message">Select an episode to view its scenes.</div>`;
                    speakBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                const volume = storyData.volumes.find(v => v.name === selectedVolume);
                if (!volume) {
                    logDebug(`Volume not found: "${selectedVolume}"`);
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    updateSceneNavButtons();
                    return;
                }

                const episode = volume.episodes.find(e => e.id === selectedEpisodeId);
                if (!episode) {
                    logDebug(`Episode not found with ID: "${selectedEpisodeId}"`);
                    populateSelect(sceneSelect, [], '— Select Scene —');
                    updateSceneNavButtons();
                    return;
                }

                const sceneItems = episode.scenes.map((s, index) => ({
                    id: s.id,
                    label: `${index + 1} - ${s.name}`
                }));
                logDebug(`Found ${sceneItems.length} scenes for episode "${episode.name}"`);
                populateSelect(sceneSelect, sceneItems, '— Select Scene —');
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
                if (helpVisible) {
                    helpVisible = false;
                    helpBtn.classList.remove('help-active');
                    helpBtn.textContent = '❓ Help';
                    resumeChunkIndex = -1;
                    resumeAutoStart = false;
                }

                const selectedVolume = volumeSelect.value;
                const selectedEpisodeId = episodeSelect.value;
                const selectedSceneId = sceneSelect.value;
                logDebug(`displaySelectedScene called with: ${selectedVolume} → ${selectedEpisodeId} → ${selectedSceneId}${autoStart ? ' (autoStart)' : ''}`);

                if (!selectedVolume || !selectedEpisodeId || !selectedSceneId || !storyData) {
                    contentArea.innerHTML = `<div class="message">Please make a selection.</div>`;
                    speakBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                const volume = storyData.volumes.find(v => v.name === selectedVolume);
                if (!volume) {
                    logDebug(`Volume not found: "${selectedVolume}"`);
                    updateSceneNavButtons();
                    return;
                }

                const episode = volume.episodes.find(e => e.id === selectedEpisodeId);
                if (!episode) {
                    logDebug(`Episode not found with ID: "${selectedEpisodeId}"`);
                    updateSceneNavButtons();
                    return;
                }

                const scene = episode.scenes.find(s => s.id === selectedSceneId);
                if (!scene) {
                    logDebug(`Scene not found with ID: "${selectedSceneId}"`);
                    contentArea.innerHTML = `<div class="error">Scene not found.</div>`;
                    speakBtn.disabled = true;
                    updateSceneNavButtons();
                    return;
                }

                logDebug(`Displaying scene "${scene.name}" with ${scene.content.length} characters`);
                showContent(scene.name, scene.content, !!autoStart);
                setStatus(`Reading: ${selectedVolume} → ${episode.name} → ${scene.name}`);
                saveReadingProgress();
                chunks = [];
                currentChunkIndex = -1;
                ttsActive = false;
                setTtsButtonsActive(false);
                updateChunkUI();
                updateSceneNavButtons();
            }

            volumeSelect.addEventListener('change', function() {
                const val = this.value;
                logDebug(`=== Volume changed to: "${val}" ===`);
                if (cascadingSelectChange) return;
                updateEpisodes();
            });

            episodeSelect.addEventListener('change', function() {
                const val = this.value;
                logDebug(`=== Episode changed to: "${val}" ===`);
                if (cascadingSelectChange) return;
                updateScenes();
            });

            sceneSelect.addEventListener('change', function() {
                const val = this.value;
                logDebug(`=== Scene changed to: "${val}" ===`);
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
                // Invalidate any fetch/FileReader callback already in flight.
                loadRequestId++;

                if (window.speechSynthesis) window.speechSynthesis.cancel();
                clearResumeTimer();
                clearPendingPause();
                cancelAutoplayCountdown();
                // No active story means no narration, so drop the wake lock.
                releaseWakeLock();

                currentUtterance = null;
                ttsActive = false;
                ttsPaused = false;
                chunks = [];
                currentChunkIndex = -1;
                currentSceneName = '';
                currentSceneText = '';
                sceneContentEl = null;
                storyData = null;

                speakBtn.textContent = '🔊 Speak Scene';
                pauseBtn.textContent = '⏸ Pause';
                setTtsButtonsActive(false);
                updateChunkUI();

                if (fileInput) fileInput.value = '';
                fileLoadArea.classList.remove('visible');
                resetNavigationControls();

                contentArea.innerHTML = `
                    <div class="message">
                        <p>${reason || 'No story loaded yet.'}</p>
                    </div>
                `;

                updateSceneNavButtons();
                logDebug(`Active story cleared${reason ? `: ${reason}` : ''}`);
            }

            function loadStoryFromText(text, requestId) {
                if (requestId !== undefined && requestId !== loadRequestId) {
                    logDebug('Ignoring stale story-load result.');
                    return;
                }

                logDebug(`Loading story from provided text, ${text.length} characters`);

                try {
                    const parsed = parseStory(text);
                    storyData = parsed;
                    currentStoryFingerprint = makeStoryFingerprint(text);
                    // A saved reading position takes priority over the normal
                    // first-volume/first-episode/first-scene defaults.  The saved
                    // fingerprint is retained for diagnostics, but we deliberately
                    // validate the saved Volume/Episode/Scene against the newly
                    // loaded story below instead of discarding it merely because
                    // the story file has changed (for example, after an update).
                    pendingResumeProgress = getSavedProgress();
                    if (pendingResumeProgress) {
                        logDebug(`Saved reading position found: ${pendingResumeProgress.volume} → ${pendingResumeProgress.episode} → ${pendingResumeProgress.scene}`);
                        if (pendingResumeProgress.fingerprint && pendingResumeProgress.fingerprint !== currentStoryFingerprint) {
                            logDebug('Story fingerprint differs from saved progress; attempting to restore the saved location anyway.');
                        }
                    }

                    if (!storyData.volumes || storyData.volumes.length === 0) {
                        throw new Error('No volumes found in the file.');
                    }

                    updateNavigation();
                    setStatus(`Loaded ${storyData.volumes.length} volume(s).`);
                    fileLoadArea.classList.remove('visible');
                } catch (error) {
                    console.error('Error:', error);
                    logDebug(`ERROR: ${error.message}`);
                    contentArea.innerHTML = `
                        <div class="error">
                            <strong>Error loading story:</strong><br>
                            ${error.message}
                        </div>
                    `;
                    setStatus('Error loading story.', true);
                }
            }

            function hasActiveReadingProgress() { return !!(storyData && getCurrentFlatIndex() >= 0); }
            function confirmStoryReplacement(label) {
                if (!hasActiveReadingProgress()) return true;
                return confirm(`${label} will replace the currently loaded story. Your saved reading position will remain available. Continue?`);
            }

            function openFilePicker() {
                if (!confirmStoryReplacement('Loading from your computer')) return;
                // This deliberately does not fetch from the server. Once the user
                // chooses this route, the current session remains in manual mode.
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
                    if (requestId !== loadRequestId || !serverFetchDisabled) {
                        logDebug('Ignoring stale/manual file-load result.');
                        return;
                    }
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

            // Load the story from the server.
            //
            // `explicit` distinguishes a user-initiated "Reload from Server"
            // (which is often used precisely to check whether the file server
            // is reachable) from the automatic fetch on first page load. When
            // explicit, a failed fetch must NOT silently fall back to the
            // offline story cache — that would mask a server outage and make
            // the reload button untrustworthy as a health check.
            function loadStoryFromServer(explicit) {
                if (!confirmStoryReplacement('Reloading from the server')) return;
                if (serverFetchDisabled) {
                    logDebug('Server fetch explicitly requested — switching back to server mode.');
                }

                serverFetchDisabled = false;
                clearActiveStory('Fetching the latest story from the server...');
                const requestId = loadRequestId;

                setStatus('Loading latest story file from server...');
                logDebug(`=== Fetching latest file: ${STORY_FILE}${explicit ? ' (user-requested reload)' : ''} ===`);

                // Cache-busting plus no-store ensures this is a fresh server request
                // rather than an old browser-cached copy.
                const cacheBuster = `${STORY_FILE}${STORY_FILE.includes('?') ? '&' : '?'}_=${Date.now()}`;

                fetch(cacheBuster, { cache: 'no-store' })
                    .then(response => {
                        if (requestId !== loadRequestId) {
                            throw new Error('Server fetch superseded by another load request.');
                        }

                        logDebug(`Response status: ${response.status}`);
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: Could not fetch '${STORY_FILE}'`);
                        }
                        return response.text();
                    })
                    .then(text => {
                        if (requestId !== loadRequestId || serverFetchDisabled) {
                            logDebug('Ignoring stale server-load result.');
                            return;
                        }
                        logDebug(`Latest file loaded via fetch, ${text.length} characters`);
                        currentStorySource = 'server';
                        cacheStoryText(text, currentStorySource);
                        loadStoryFromText(text, requestId);
                    })
                    .catch(error => {
                        if (requestId !== loadRequestId) {
                            logDebug(`Server fetch superseded: ${error.message}`);
                            return;
                        }

                        console.warn('Fetch failed, showing file picker:', error.message);
                        logDebug(`Fetch failed: ${error.message}`);

                        // Only use the offline cache on the automatic, page-load
                        // fetch. An explicit reload that fails must surface the
                        // failure so the user can tell the server is unreachable.
                        if (!explicit) {
                            const cached = getCachedStory();
                            if (cached) {
                                currentStorySource = cached.source || 'offline-cache';
                                const cacheDate = new Date(cached.savedAt).toLocaleString();
                                setStatus(`⚠️ Server unavailable — using cached story from ${cacheDate}.`);
                                logDebug(`→ Offline fallback: cached story from ${cacheDate}.`);
                                loadStoryFromText(cached.text, requestId);
                                return;
                            }
                            logDebug('→ No offline cache available — revealing file-picker fallback.');
                        } else {
                            logDebug('→ Explicit reload failed; skipping offline cache fallback.');
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

            // Unload the current story without touching any persisted state
            // (saved reading position, preferences, or the offline story cache).
            // Uses the same replacement-confirmation pattern as the other two
            // source buttons, and only prompts when a story is actually loaded.
            function clearLoadedStory() {
                if (!hasActiveReadingProgress()) {
                    logDebug('Clear Loaded Story: nothing to clear — no active story.');
                    setStatus('No story is currently loaded.');
                    return;
                }
                if (!confirmStoryReplacement('Clearing the loaded story')) return;

                clearActiveStory('No story loaded. Use “Load from Computer” or “Reload from Server” to begin.');
                setStatus('Loaded story cleared. Saved reading position preserved.');

                // Restore the visible file-load prompt so the user has a clear
                // path back to loading content.
                fileLoadArea.classList.add('visible');
            }

            uploadSourceBtn.addEventListener('click', openFilePicker);
            serverSourceBtn.addEventListener('click', function() { loadStoryFromServer(true); });
            clearStoryBtn.addEventListener('click', clearLoadedStory);

            // Default behaviour remains: try the server first on page load.
            // If that fails and an offline cache exists, silently use it (the
            // user did not ask for a server check, so this is helpful rather
            // than misleading). Only an explicit reload surfaces the failure.
            loadStoryFromServer(false);

        })();
    

;