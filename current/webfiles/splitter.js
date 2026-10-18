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

    let loadedFile = null;

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
    const VOLUME_RE  = /^[\s\u00A0]*VOLUME\s*[-–—]\s*(.+?)\s*$/i;
    const EPISODE_RE = /^[\s\u00A0]*EPISODE\s*[-–—]\s*(.+?)\s*$/i;
    const SCENE_RE   = /^[\s\u00A0]*SCENE\s*$/i;

    function parseManuscript(text) {
        const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalised.split('\n');

        const volumes = [];
        let currentVolume = null;
        let currentEpisode = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const volMatch = line.match(VOLUME_RE);
            if (volMatch) {
                const volName = volMatch[1].trim();
                currentVolume = { name: volName, episodes: [] };
                volumes.push(currentVolume);
                currentEpisode = null;
                continue;
            }

            const epMatch = line.match(EPISODE_RE);
            if (epMatch) {
                const epName = epMatch[1].trim();
                if (!currentVolume) {
                    currentVolume = { name: 'Unassigned', episodes: [] };
                    volumes.push(currentVolume);
                }
                currentEpisode = { name: epName, lines: [] };
                currentVolume.episodes.push(currentEpisode);
                continue;
            }

            if (currentEpisode) {
                currentEpisode.lines.push(line);
            }
        }

        return volumes;
    }

    // ── Formatting ───────────────────────────────────────────────
    function formatEpisodeLines(lines) {
        const out = [];
        for (const raw of lines) {
            const trimmedRight = raw.replace(/[ \t]+$/, '');
            if (trimmedRight.trim() === '') {
                out.push('');
                continue;
            }
            if (SCENE_RE.test(trimmedRight)) {
                out.push('SCENE');
                continue;
            }
            out.push('\t' + trimmedRight.replace(/^[ \t\u00A0]+/, ''));
        }
        return out;
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

        const volumes = parseManuscript(text);

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

                const formatted = formatEpisodeLines(ep.lines);
                while (formatted.length && formatted[0] === '') formatted.shift();
                while (formatted.length && formatted[formatted.length - 1] === '') formatted.pop();

                const content =
                    'EPISODE - ' + ep.name + '\n' +
                    '='.repeat(60) + '\n\n' +
                    formatted.join('\n') + '\n';

                volFolder.file(fileName, content);

                const lineCount = formatted.length;
                log('   ✓ ' + fileName + '  (' + lineCount + ' lines)', 'ok');

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
            log('✗ Error: ' + err.message, 'err');
        });
    });

})();


;