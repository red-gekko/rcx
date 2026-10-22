/* ========================================================= */
/* Generated page JavaScript                                  */
/* The original script order has been preserved.             */
/* ========================================================= */


/* --------------------------------------------------------- */
/* Original script 1: splitter.html */
/* --------------------------------------------------------- */


(function () {
    'use strict';

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const splitBtn = document.getElementById('splitBtn');
    const logEl = document.getElementById('log');
    const dzLabel = document.getElementById('dzLabel');
    const dzHint = document.getElementById('dzHint');

    // Settings elements
    const settingIgnoreCutoff = document.getElementById('setting-ignore-cutoff');
    const settingIgnoreCutoffState = document.getElementById('setting-ignore-cutoff-state');
    const settingIncludeSceneHeaders = document.getElementById('setting-include-scene-headers');
    const settingIncludeSceneHeadersState = document.getElementById('setting-include-scene-headers-state');
    const settingIncludeEpisodeHeaders = document.getElementById('setting-include-episode-headers');
    const settingIncludeEpisodeHeadersState = document.getElementById('setting-include-episode-headers-state');
    const settingIncludeVolumeHeaders = document.getElementById('setting-include-volume-headers');
    const settingIncludeVolumeHeadersState = document.getElementById('setting-include-volume-headers-state');

    let loadedFile = null;

    // --- Settings State ---
    const DEFAULT_SETTINGS = {
        ignoreCutoff: false,
        includeSceneHeaders: true,
        includeEpisodeHeaders: true,
        includeVolumeHeaders: true,
    };
    let settings = { ...DEFAULT_SETTINGS };

    const STORAGE_KEY = 'BloodhoundSplitter.settings.v1';

    // --- Markers ---
    const CUTOFF_MARKER = '////';
    const RESUME_MARKER = '\\\\';
    // A divider is a line consisting only of underscores (with optional surrounding whitespace).
    const DIVIDER_RE = /^[\s\u00A0]*_+[\s\u00A0]*$/;
    // A SCENE marker is a line whose only non-whitespace content is the word SCENE.
    const SCENE_HEADER_RE = /^[\s\u00A0]*SCENE[\s\u00A0]*$/i;
    const VOLUME_RE  = /^[\s\u00A0]*VOLUME\s*[-–—]\s*(.+?)\s*$/i;
    const EPISODE_RE = /^[\s\u00A0]*EPISODE\s*[-–—]\s*(.+?)\s*$/i;

    // ── Logging ──────────────────────────────────────────────────
    function log(msg, cls) {
        logEl.style.display = 'block';
        const span = document.createElement('span');
        if (cls) span.className = cls;
        span.textContent = msg + '\n';
        logEl.appendChild(span);
        logEl.scrollTop = logEl.scrollHeight;
    }
    function clearLog() { logEl.innerHTML = ''; logEl.style.display = 'none'; }

    // ── Settings Persistence ──────────────────────────────────────
    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                settings = {
                    ignoreCutoff: typeof saved.ignoreCutoff === 'boolean' ? saved.ignoreCutoff : DEFAULT_SETTINGS.ignoreCutoff,
                    includeSceneHeaders: typeof saved.includeSceneHeaders === 'boolean' ? saved.includeSceneHeaders : DEFAULT_SETTINGS.includeSceneHeaders,
                    includeEpisodeHeaders: typeof saved.includeEpisodeHeaders === 'boolean' ? saved.includeEpisodeHeaders : DEFAULT_SETTINGS.includeEpisodeHeaders,
                    includeVolumeHeaders: typeof saved.includeVolumeHeaders === 'boolean' ? saved.includeVolumeHeaders : DEFAULT_SETTINGS.includeVolumeHeaders,
                };
            }
        } catch (e) {
            console.warn('Could not load splitter settings:', e);
        }
        syncSettingsUI();
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.warn('Could not save splitter settings:', e);
        }
    }

    function syncSettingsUI() {
        settingIgnoreCutoff.checked = settings.ignoreCutoff;
        settingIgnoreCutoffState.textContent = settings.ignoreCutoff ? 'On' : 'Off';

        settingIncludeSceneHeaders.checked = settings.includeSceneHeaders;
        settingIncludeSceneHeadersState.textContent = settings.includeSceneHeaders ? 'On' : 'Off';

        settingIncludeEpisodeHeaders.checked = settings.includeEpisodeHeaders;
        settingIncludeEpisodeHeadersState.textContent = settings.includeEpisodeHeaders ? 'On' : 'Off';

        settingIncludeVolumeHeaders.checked = settings.includeVolumeHeaders;
        settingIncludeVolumeHeadersState.textContent = settings.includeVolumeHeaders ? 'On' : 'Off';
    }

    // ── Settings Event Handlers ───────────────────────────────────
    settingIgnoreCutoff.addEventListener('change', function() {
        settings.ignoreCutoff = this.checked;
        syncSettingsUI();
        saveSettings();
    });

    settingIncludeSceneHeaders.addEventListener('change', function() {
        settings.includeSceneHeaders = this.checked;
        syncSettingsUI();
        saveSettings();
    });

    settingIncludeEpisodeHeaders.addEventListener('change', function() {
        settings.includeEpisodeHeaders = this.checked;
        syncSettingsUI();
        saveSettings();
    });

    settingIncludeVolumeHeaders.addEventListener('change', function() {
        settings.includeVolumeHeaders = this.checked;
        syncSettingsUI();
        saveSettings();
    });

    // ── File handling ────────────────────────────────────────────
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.txt')) {
            alert('Please select a .txt file.');
            return;
        }
        loadedFile = file;
        dropZone.classList.add('has-file');
        dzLabel.textContent = '✓ ' + file.name;
        dzHint.innerHTML = '<span class="file-info">' + (file.size / 1024).toFixed(1) + ' KB loaded</span>';
        splitBtn.disabled = false;
        clearLog();
    }

    // ── Parsing ──────────────────────────────────────────────────
    // The output is a list of volumes. Each volume has a name and a list of
    // episodes. Each episode has a name and a list of scenes. Each scene has
    // a name (may be empty) and an array of raw content lines (with the
    // source's leading whitespace intact, since we'll strip it later).
    //
    // The format of the source is:
    //   [optional VOLUME - X header]
    //   [optional EPISODE - Y header]
    //   [divider line]
    //   SCENE
    //       content lines...
    //       [blank lines]
    //       Scene Name          <-- optional; the line immediately before
    //                              the next divider or the next SCENE
    //   [divider line]
    //   SCENE
    //       ...
    //
    // To correctly detect scene names, we need to look at the line immediately
    // before each divider (or, if a SCENE block has no divider before the
    // next SCENE, the line immediately before the next SCENE marker).
    function parseManuscript(text, ignoreCutoff) {
        const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalised.split('\n');

        const volumes = [];
        let currentVolume = null;
        let currentEpisode = null;

        // We buffer raw scene blocks here, and only finalise them once we
        // know where the next divider/SCENE is.
        let inScene = false;
        let sceneBuffer = [];      // raw lines, including trailing blanks
        let pendingSceneName = null; // resolved lazily when we finalise

        let redacting = false;

        // Helper: flush the current scene buffer into the current episode.
        // `name` is what we resolved as the scene's name (may be empty).
        function flushScene(name) {
            if (!inScene) return;
            if (currentEpisode) {
                currentEpisode.scenes.push({
                    name: name || '',
                    lines: sceneBuffer.slice(),
                });
            }
            inScene = false;
            sceneBuffer = [];
        }

        // Helper: resolve the scene name by looking at the tail of the buffer.
        // The convention is: name = the last non-blank line before a divider.
        // We drop that line from the content and (optionally) emit it as a
        // SCENE header.
        function resolveSceneNameFromBuffer() {
            // Trim trailing blank lines from the buffer (they belong to the
            // gap between scenes, not the scene content).
            while (sceneBuffer.length > 0 && sceneBuffer[sceneBuffer.length - 1].trim() === '') {
                sceneBuffer.pop();
            }

            if (sceneBuffer.length === 0) return '';

            const candidate = sceneBuffer[sceneBuffer.length - 1].trim();

            // Don't mistake a structural line for a scene name.
            if (candidate === '' ||
                DIVIDER_RE.test(candidate) ||
                SCENE_HEADER_RE.test(candidate) ||
                VOLUME_RE.test(candidate) ||
                EPISODE_RE.test(candidate) ||
                candidate === CUTOFF_MARKER ||
                candidate === RESUME_MARKER) {
                return '';
            }

            // Heuristic: a scene name is usually short and on its own line,
            // often not ending in normal sentence punctuation. This is a
            // *very* loose heuristic, but the WIP source follows this
            // convention consistently.
            //
            // We're conservative: only treat a line as a scene name if it's
            // reasonably short (< 80 chars), not ending in a comma/semicolon,
            // and not obviously a sentence fragment.
            if (candidate.length > 80) return '';
            if (/[,;]$/.test(candidate)) return '';

            // Pull it out of the buffer.
            sceneBuffer.pop();
            // Trim trailing blanks again after popping.
            while (sceneBuffer.length > 0 && sceneBuffer[sceneBuffer.length - 1].trim() === '') {
                sceneBuffer.pop();
            }
            return candidate;
        }

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();

            // ── Cutoff / Resume Markers ──
            if (trimmed === CUTOFF_MARKER) {
                if (!ignoreCutoff) redacting = true;
                continue;
            }
            if (trimmed === RESUME_MARKER) {
                redacting = false;
                continue;
            }
            if (redacting) continue;

            // ── VOLUME header ──
            const volMatch = rawLine.match(VOLUME_RE);
            if (volMatch) {
                flushScene(resolveSceneNameFromBuffer());
                currentEpisode = null;
                currentVolume = { name: volMatch[1].trim(), episodes: [] };
                volumes.push(currentVolume);
                continue;
            }

            // ── EPISODE header ──
            const epMatch = rawLine.match(EPISODE_RE);
            if (epMatch) {
                flushScene(resolveSceneNameFromBuffer());
                if (!currentVolume) {
                    currentVolume = { name: 'Unassigned', episodes: [] };
                    volumes.push(currentVolume);
                }
                currentEpisode = { name: epMatch[1].trim(), scenes: [] };
                currentVolume.episodes.push(currentEpisode);
                continue;
            }

            // ── Divider line ──
            // A divider line immediately signals the end of the current
            // scene's content. The scene's name is the last non-blank line
            // in the buffer before the divider.
            if (DIVIDER_RE.test(rawLine)) {
                if (inScene) {
                    const name = resolveSceneNameFromBuffer();
                    flushScene(name);
                }
                // If not in a scene, dividers between VOLUME/EPISODE headers
                // are just noise — skip them.
                continue;
            }

            // ── SCENE marker ──
            if (SCENE_HEADER_RE.test(rawLine)) {
                // If we're already inside a scene, this SCENE marker ends it.
                // (This happens when there's no divider between scenes.)
                if (inScene) {
                    const name = resolveSceneNameFromBuffer();
                    flushScene(name);
                }
                if (!currentEpisode) {
                    if (!currentVolume) {
                        currentVolume = { name: 'Unassigned', episodes: [] };
                        volumes.push(currentVolume);
                    }
                    currentEpisode = {
                        name: `Episode ${currentVolume.episodes.length + 1}`,
                        scenes: []
                    };
                    currentVolume.episodes.push(currentEpisode);
                }
                inScene = true;
                sceneBuffer = [];
                continue;
            }

            // ── Regular content line ──
            if (inScene) {
                sceneBuffer.push(rawLine);
            }
            // Lines outside any scene (between header and first SCENE) are
            // ignored — they're usually the episode header itself, or blank
            // lines from the divider.
        }

        // End of file — flush any remaining scene.
        if (inScene) {
            const name = resolveSceneNameFromBuffer();
            flushScene(name);
        }

        // Final cleanup: trim leading/trailing blank lines from each scene's
        // content (they're usually artifacts of the divider layout).
        for (const vol of volumes) {
            for (const ep of vol.episodes) {
                for (const scene of ep.scenes) {
                    while (scene.lines.length > 0 && scene.lines[0].trim() === '') scene.lines.shift();
                    while (scene.lines.length > 0 && scene.lines[scene.lines.length - 1].trim() === '') scene.lines.pop();
                }
            }
        }

        return volumes;
    }

    // ── Formatting ───────────────────────────────────────────────
    // Given a single scene object ({ name, lines }) and the current settings,
    // produce the formatted output lines for that scene.
    //
    // - If includeSceneHeaders is on and the scene has a name, prepend
    //   "SCENE - <name>" followed by a blank line.
    // - If includeSceneHeaders is on but the scene has no name, emit just
    //   "SCENE".
    // - If includeSceneHeaders is off, skip both.
    // - All content lines are trimmed and re-indented with a single tab.
    // - Blank lines are preserved as empty strings.
    // - Cutoff/resume markers and stray dividers are dropped defensively.
    function formatSceneLines(scene) {
        const out = [];

        if (settings.includeSceneHeaders) {
            if (scene.name) {
                out.push('SCENE - ' + scene.name);
            } else {
                out.push('SCENE');
            }
            out.push('');
        }

        for (const raw of scene.lines) {
            const trimmed = raw.trim();

            // Defensive: drop any stray structural lines that slipped through.
            if (DIVIDER_RE.test(raw)) continue;
            if (trimmed === CUTOFF_MARKER || trimmed === RESUME_MARKER) continue;

            if (trimmed === '') {
                out.push('');
            } else {
                out.push('' + trimmed);
            }
        }

        return out;
    }

    // Build the full output text for one episode, honouring all settings.
    function formatEpisode(ep, volName) {
        const headerParts = [];
        if (settings.includeVolumeHeaders && volName && volName !== 'Unassigned') {
            headerParts.push('VOLUME - ' + volName);
        }
        if (settings.includeEpisodeHeaders) {
            headerParts.push('EPISODE - ' + ep.name);
        }

        const body = [];
        ep.scenes.forEach((scene, idx) => {
            if (idx > 0) body.push(''); // blank line between scenes
            const formatted = formatSceneLines(scene);
            // Remove trailing blanks inside a scene so we don't stack too many.
            while (formatted.length > 0 && formatted[formatted.length - 1] === '') formatted.pop();
            body.push(...formatted);
        });

        // Trim leading/trailing blanks from the body.
        while (body.length > 0 && body[0] === '') body.shift();
        while (body.length > 0 && body[body.length - 1] === '') body.pop();

        let content = '';
        if (headerParts.length > 0) {
            content += headerParts.join('\n') + '\n' + '='.repeat(60) + '\n\n';
        }
        content += body.join('\n') + '\n';
        return content;
    }

    // ── Filename sanitisation ────────────────────────────────────
    function sanitise(name) {
        return name
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^\.+/, '')
            .replace(/[\. ]+$/, '')
            .trim() || 'Untitled';
    }

    // ── Timestamp ────────────────────────────────────────────────
    function timestamp() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return [
            d.getFullYear(),
            pad(d.getMonth() + 1),
            pad(d.getDate()),
            pad(d.getHours()),
            pad(d.getMinutes()),
            pad(d.getSeconds())
        ].join('-');
    }

    // ── Main split routine ───────────────────────────────────────
    async function splitAndDownload(file) {
        clearLog();
        log('Reading file: ' + file.name, 'header');

        const text = await file.text();
        log('File size: ' + text.length + ' characters', 'header');
        log('');

        const volumes = parseManuscript(text, settings.ignoreCutoff);

        if (volumes.length === 0) {
            log('✗ No VOLUME or EPISODE headers found.', 'err');
            return;
        }

        log('Found ' + volumes.length + ' volume(s):', 'header');
        log('');

        const zip = new JSZip();
        let totalEpisodes = 0;

        let volNum = 0;
        for (const vol of volumes) {
            const volFolderName = 'Volume ' + volNum + ' - ' + sanitise(vol.name);
            log('▸ ' + volFolderName + ' (' + vol.episodes.length + ' episode' + (vol.episodes.length === 1 ? '' : 's') + ')', 'ok');

            const volFolder = zip.folder(volFolderName);

            if (vol.episodes.length === 0) {
                volFolder.file('_NO_EPISODES_FOUND.txt',
                    'No EPISODE headers were found under this volume.\n' +
                    'Volume: ' + vol.name + '\n');
                log('   ⚠ no episodes found — added placeholder', 'warn');
                volNum++;
                continue;
            }

            let epNum = 1;
            for (const ep of vol.episodes) {
                const epTitle = sanitise(ep.name);
                const fileName = 'Episode ' + epNum + ' - ' + epTitle + '.txt';

                const content = formatEpisode(ep, vol.name);
                volFolder.file(fileName, content);

                const lineCount = content.split('\n').length;
                log('   ✓ ' + fileName + '  (' + lineCount + ' lines, ' + ep.scenes.length + ' scene' + (ep.scenes.length === 1 ? '' : 's') + ')', 'ok');

                epNum++;
                totalEpisodes++;
            }
            log('');
            volNum++;
        }

        log('─'.repeat(50), 'header');
        log('Total: ' + volumes.length + ' volume(s), ' + totalEpisodes + ' episode(s)', 'ok');
        log('');
        log('Generating ZIP…', 'header');

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const baseName = file.name.replace(/\.txt$/i, '');
        const stamp = timestamp();
        a.href = url;
        a.download = baseName + ' - split-' + stamp + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        log('✓ Done. ZIP downloaded as:', 'ok');
        log('   ' + baseName + ' - split-' + stamp + '.zip', 'ok');
    }

    splitBtn.addEventListener('click', () => {
        if (!loadedFile) return;
        splitAndDownload(loadedFile).catch(err => {
            console.error(err);
            if (err && err.stack) console.error(err.stack);
            log('✗ Error: ' + (err.message || err), 'err');
        });
    });

    // ── Initialization ────────────────────────────────────────────
    loadSettings();

})();