/* ========================================================= */
/* Landing page — "Continue reading" banner                  */
/* ========================================================= */

(function () {
    'use strict';

    // Keep this list in sync with STORY_CONFIG.storagePrefix in each
    // story.html (the reader writes progress under `${prefix}.progress.v1`).
    const STORIES = [
        {
            prefix: 'bloodhoundReader',
            title:  'Bloodhound',
            url:    'Bloodhound/story.html',
            icon:   '📖'
        },
        {
            prefix: 'youngManLoganReader',
            title:  'Young Man Logan',
            url:    'YML/story.html',
            icon:   '📖'
        }
    ];

    function readProgress(prefix) {
        try {
            const raw = localStorage.getItem(prefix + '.progress.v1');
            if (!raw) return null;
            const p = JSON.parse(raw);
            if (!p || typeof p.savedAt !== 'number') return null;
            return p;
        } catch (e) {
            return null;
        }
    }

    function relativeTime(ms) {
        const diff = Date.now() - ms;
        const min = Math.floor(diff / 60000);
        if (min < 1) return 'just now';
        if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
        const day = Math.floor(hr / 24);
        if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
        return new Date(ms).toLocaleDateString();
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function findMostRecent() {
        let best = null;
        for (const story of STORIES) {
            const p = readProgress(story.prefix);
            if (!p) continue;
            if (!best || p.savedAt > best.progress.savedAt) {
                best = { story, progress: p };
            }
        }
        return best;
    }

    /**
     * Format one breadcrumb segment: "Volume 0 - Name", "Episode 4 - Name",
     * "Scene 2 - Name".
     *
     * If the name is missing or auto-generated (the parser uses
     * "Scene 2" / "Episode 3" / "Volume 1" as defaults), don't repeat
     * the kind + number — just render the label once:
     *   Scene 2 - Scene 2   →   Scene 2
     */
    function segment(kind, number, name, rawValue) {
        const n = Number.isInteger(number) ? number : null;

        // Prefer the friendly name. Fall back to rawValue ONLY if it
        // doesn't look like a generated ID (`episode-0-1`, `scene-1-2-0`).
        let label = (name || '').trim();
        if (!label && rawValue && !/^[a-z]+-\d+-\d+/.test(String(rawValue))) {
            label = String(rawValue).trim();
        }
        if (!label) return null;

        // If the label is exactly the default pattern (`<Kind> <n>`),
        // render it once instead of "Scene 2 - Scene 2".
        const defaultLabel = n !== null ? `${kind} ${n}` : null;
        if (defaultLabel && label === defaultLabel) return label;

        return n ? `${kind} ${n} - ${label}` : label;
    }

    /**
     * Build the breadcrumb string for a saved progress object.
     *   Whole Series  → series name only
     *   Whole Volume  → "Volume X - …"
     *   Whole Episode → "Volume X - …, Episode X - …"
     *   Single scene  → "Volume X - …, Episode X - …, Scene X - …"
     *
     * Volumes are 0-based (Volume 0 is the codex / primer / foreword);
     * episodes and scenes are 1-based.
     */
    function breadcrumbText(progress, seriesTitle) {
        if (progress.wholeSeries) return seriesTitle;

        const parts = [];

        if (progress.volume || progress.volumeName) {
            const s = segment('Volume', progress.volumeNumber,
                              progress.volumeName, progress.volume);
            if (s) parts.push(s);
        }

        if (!progress.wholeVolume && progress.episode) {
            const s = segment('Episode', progress.episodeNumber,
                              progress.episodeName, progress.episode);
            if (s) parts.push(s);
        }

        if (!progress.wholeVolume && !progress.wholeEpisode) {
            const s = segment('Scene', progress.sceneNumber,
                              progress.sceneName, progress.scene);
            if (s) parts.push(s);
        }

        return parts.length ? parts.join(', ') : 'your last position';
    }

    function buildBanner(best) {
        const { story, progress } = best;

        const where = breadcrumbText(progress, story.title);
        const when = relativeTime(progress.savedAt);

        const banner = document.createElement('a');
        banner.className = 'continue-banner';
        banner.href = story.url;
        banner.target = '_blank';
        banner.rel = 'noopener noreferrer';
        banner.setAttribute(
            'aria-label',
            `Continue reading ${story.title} from ${where}, last saved ${when}`
        );

        banner.innerHTML = `
            <span class="continue-banner-icon" aria-hidden="true">${story.icon}</span>
            <span class="continue-banner-body">
                <span class="continue-banner-label">Continue reading</span>
                <span class="continue-banner-title">${escapeHtml(story.title)}</span>
                <span class="continue-banner-where">
                    ${escapeHtml(where)} · ${escapeHtml(when)}
                </span>
            </span>
            <span class="continue-banner-cta" aria-hidden="true">Resume →</span>
        `;

        return banner;
    }

    function init() {
        const container = document.querySelector('.container');
        if (!container) return;

        const best = findMostRecent();
        if (!best) return;

        const banner = buildBanner(best);

        // Insert just below the subtitle, above the intro panel.
        const anchor = container.querySelector('.landing-intro')
            || container.querySelector('.subtitle')
            || container.firstElementChild;

        if (anchor && anchor.parentNode === container) {
            container.insertBefore(banner, anchor);
        } else {
            container.insertBefore(banner, container.firstChild);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();