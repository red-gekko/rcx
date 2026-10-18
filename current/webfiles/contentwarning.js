/* ========================================================= */
/* Generated page JavaScript                                  */
/* The original script order has been preserved.             */
/* ========================================================= */


/* --------------------------------------------------------- */
/* Original script 1: contentwarning.html                     */
/* --------------------------------------------------------- */


(function () {
    'use strict';

    const form = document.getElementById('cw-contact-form');
    const toast = document.getElementById('cw-toast');
    const copyBtn = document.getElementById('cw-copy-btn');
    const CONTACT_EMAIL = 'contentwarning@red-gekko.github.io';

    function buildMessage() {
        const name = document.getElementById('cw-name').value.trim() || '(not provided)';
        const email = document.getElementById('cw-email').value.trim();
        const episode = document.getElementById('cw-episode').value;
        const message = document.getElementById('cw-message').value.trim();

        return {
            name, email, episode, message,
            valid: !!(email && episode && message)
        };
    }

    function showToast(text) {
        toast.textContent = text;
        toast.classList.add('visible');
        setTimeout(function () {
            toast.classList.remove('visible');
        }, 4000);
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = buildMessage();

        if (!data.valid) {
            showToast('⚠ Please complete the email, episode, and message fields.');
            return;
        }

        const body = [
            'Name: ' + data.name,
            'Email: ' + data.email,
            'Episode: ' + data.episode,
            '',
            'Suggestion:',
            data.message
        ].join('\n');

        const mailto = 'mailto:' + CONTACT_EMAIL +
            '?subject=' + encodeURIComponent('[Bloodhound CW] ' + data.episode) +
            '&body=' + encodeURIComponent(body);

        window.location.href = mailto;
    });

    copyBtn.addEventListener('click', function () {
        const data = buildMessage();

        if (!data.valid) {
            showToast('⚠ Please complete the email, episode, and message fields.');
            return;
        }

        const body = [
            'To: ' + CONTACT_EMAIL,
            'Name: ' + data.name,
            'Email: ' + data.email,
            'Episode: ' + data.episode,
            '',
            'Suggestion:',
            data.message
        ].join('\n');

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(body).then(
                function () { showToast('✓ Message copied to clipboard.'); },
                function () { fallbackCopy(body); }
            );
        } else {
            fallbackCopy(body);
        }
    });

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('✓ Message copied to clipboard.');
        } catch (err) {
            showToast('⚠ Copy failed — please copy the text manually.');
        }
        document.body.removeChild(ta);
    }
})();


/* --------------------------------------------------------- */
/* Original script 2: contentwarning.html                     */
/* --------------------------------------------------------- */


(function () {
    'use strict';

    // ── DOM refs ──
    const panel = document.getElementById('tagFilterPanel');
    const header = document.getElementById('tagFilterHeader');
    const searchInput = document.getElementById('tagSearchInput');
    const tagCloud = document.getElementById('tagCloud');
    const selectedBar = document.getElementById('selectedFiltersBar');
    const clearBtn = document.getElementById('clearFiltersBtn');
    const modeAndBtn = document.getElementById('modeAndBtn');
    const modeOrBtn = document.getElementById('modeOrBtn');
    const modeNotBtn = document.getElementById('modeNotBtn');
    const modeHint = document.getElementById('modeHint');

    const unselectedWrapper = document.getElementById('unselectedTagsWrapper');
    const unselectedHeader = document.getElementById('unselectedTagsHeader');
    const unselectedCount = document.getElementById('unselectedTagsCount');
    const noMatchingTags = document.getElementById('noMatchingTags');

    const episodeWarnings = Array.from(document.querySelectorAll('.episode-warning'));
    const volumeBlocks = Array.from(document.querySelectorAll('.volume-block'));

    // ── State ──
    let selectedTags = new Set();
    let allTagData = []; // { text, count, severity }
    let matchMode = 'AND'; // 'AND' | 'OR' | 'NOT'

    // ── 1. Collect unique tags ──
    // Excludes the "None beyond baseline" placeholder tag, which is not a content warning.
    function collectTags() {
        const tagMap = new Map();

        episodeWarnings.forEach(function (ep) {
            const tags = ep.querySelectorAll('.ep-tags .tag');
            tags.forEach(function (tagEl) {
                const text = tagEl.textContent.trim();
                if (!text) return;
                // Skip the placeholder "none" tag
                if (tagEl.classList.contains('none')) return;

                let severity = 'mild';
                if (tagEl.classList.contains('severe')) severity = 'severe';
                else if (tagEl.classList.contains('moderate')) severity = 'moderate';
                else if (tagEl.classList.contains('mild')) severity = 'mild';

                if (!tagMap.has(text)) {
                    tagMap.set(text, { count: 1, severity: severity });
                } else {
                    tagMap.get(text).count++;
                }
            });
        });

        allTagData = Array.from(tagMap.entries()).map(function ([text, meta]) {
            return { text: text, count: meta.count, severity: meta.severity };
        });
    }

    // ── 2. Render tag cloud (only unselected tags go here) ──
    function renderTagCloud() {
        const searchTerm = searchInput.value.trim().toLowerCase();

        const unselectedTags = allTagData.filter(function (tag) {
            return !selectedTags.has(tag.text);
        }).sort(function (a, b) {
            return a.text.localeCompare(b.text);
        });

        const visibleTags = unselectedTags.filter(function (tag) {
            return !searchTerm || tag.text.toLowerCase().includes(searchTerm);
        });

        tagCloud.innerHTML = '';

        visibleTags.forEach(function (tag) {
            const el = document.createElement('span');
            el.className = 'cloud-tag';
            el.textContent = tag.text;
            el.dataset.tagText = tag.text;
            el.dataset.severity = tag.severity;

            el.addEventListener('click', function () {
                toggleTag(tag.text);
            });

            tagCloud.appendChild(el);
        });

        if (visibleTags.length === 0) {
            noMatchingTags.classList.add('visible');
        } else {
            noMatchingTags.classList.remove('visible');
        }

        if (unselectedTags.length === 0) {
            unselectedCount.textContent = '(none left)';
        } else if (searchTerm && visibleTags.length !== unselectedTags.length) {
            unselectedCount.textContent = '(' + visibleTags.length + ' of ' + unselectedTags.length + ')';
        } else {
            unselectedCount.textContent = '(' + unselectedTags.length + ')';
        }
    }

    // ── 3. Toggle a tag ──
    function toggleTag(tagText) {
        if (selectedTags.has(tagText)) {
            selectedTags.delete(tagText);
        } else {
            selectedTags.add(tagText);
        }
        updateAll();
    }

    // ── 4. Update everything ──
    function updateAll() {
        renderSelectedBar();
        renderTagCloud();
        applyFilters();
    }

    // ── 5. Render active filter pills ──
    function renderSelectedBar() {
        selectedBar.innerHTML = '';
        if (selectedTags.size === 0) return;

        const sortedSelected = Array.from(selectedTags).sort();
        sortedSelected.forEach(function (tagText) {
            const pill = document.createElement('span');
            pill.className = 'active-filter-pill';
            pill.innerHTML = tagText + ' <span class="remove-filter" title="Remove filter">✕</span>';

            pill.querySelector('.remove-filter').addEventListener('click', function (e) {
                e.stopPropagation();
                selectedTags.delete(tagText);
                updateAll();
            });

            selectedBar.appendChild(pill);
        });
    }

    // ── 6. Update mode hint ──
    function updateModeHint() {
        if (matchMode === 'AND') {
            modeHint.textContent = 'Episodes must contain all selected tags';
        } else if (matchMode === 'OR') {
            modeHint.textContent = 'Episodes may contain any selected tag';
        } else {
            modeHint.textContent = 'Episodes containing any selected tag are hidden';
        }
    }

    // ── 7. Filter episodes ──
    function applyFilters() {
        const noResultsMsg = document.getElementById('noResultsMsg');
        if (noResultsMsg) noResultsMsg.remove();

        if (selectedTags.size === 0) {
            episodeWarnings.forEach(function (ep) {
                ep.classList.remove('filtered-out');
            });
            volumeBlocks.forEach(function (vol) {
                vol.classList.remove('all-episodes-hidden');
            });
            return;
        }

        let anyVisible = false;
        const selectedArr = Array.from(selectedTags);

        episodeWarnings.forEach(function (ep) {
            const tagsInEp = Array.from(ep.querySelectorAll('.ep-tags .tag')).map(function (el) {
                return el.textContent.trim();
            });

            let matches;
            if (matchMode === 'AND') {
                matches = selectedArr.every(function (tag) {
                    return tagsInEp.includes(tag);
                });
            } else if (matchMode === 'OR') {
                matches = selectedArr.some(function (tag) {
                    return tagsInEp.includes(tag);
                });
            } else { // NOT
                // Keep episode only if it contains NONE of the selected tags
                matches = selectedArr.every(function (tag) {
                    return !tagsInEp.includes(tag);
                });
            }

            if (matches) {
                ep.classList.remove('filtered-out');
                anyVisible = true;
            } else {
                ep.classList.add('filtered-out');
            }
        });

        volumeBlocks.forEach(function (vol) {
            const visibleEps = vol.querySelectorAll('.episode-warning:not(.filtered-out)');
            if (visibleEps.length === 0) {
                vol.classList.add('all-episodes-hidden');
            } else {
                vol.classList.remove('all-episodes-hidden');
            }
        });

        if (!anyVisible) {
            const msg = document.createElement('div');
            msg.id = 'noResultsMsg';
            msg.className = 'no-results-message visible';
            msg.textContent = 'No episodes match the selected tags in ' + matchMode + ' mode. Try changing the mode or removing some filters.';
            const firstVolume = document.querySelector('.volume-block');
            if (firstVolume) {
                firstVolume.parentNode.insertBefore(msg, firstVolume);
            } else {
                document.querySelector('.container').appendChild(msg);
            }
        }
    }

    // ── 8. Search input ──
    searchInput.addEventListener('input', function () {
        renderTagCloud();
    });

    // ── 9. Collapsible main panel ──
    header.addEventListener('click', function (e) {
        if (e.target.closest('#clearFiltersBtn')) return;
        panel.classList.toggle('collapsed');
    });

    // ── 10. Collapsible unselected tags submenu ──
    unselectedHeader.addEventListener('click', function () {
        unselectedWrapper.classList.toggle('collapsed');
    });

    // ── 11. Clear all filters ──
    clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        selectedTags.clear();
        searchInput.value = '';
        updateAll();
    });

    // ── 12. AND / OR / NOT mode ──
    function setMode(mode) {
        if (matchMode === mode) return;
        matchMode = mode;

        modeAndBtn.classList.toggle('active', mode === 'AND');
        modeAndBtn.classList.remove('or-active', 'not-active');

        modeOrBtn.classList.toggle('active', mode === 'OR');
        modeOrBtn.classList.toggle('or-active', mode === 'OR');
        modeOrBtn.classList.remove('not-active');

        modeNotBtn.classList.toggle('active', mode === 'NOT');
        modeNotBtn.classList.toggle('not-active', mode === 'NOT');
        modeNotBtn.classList.remove('or-active');

        updateModeHint();
        applyFilters();
    }

    modeAndBtn.addEventListener('click', function () { setMode('AND'); });
    modeOrBtn.addEventListener('click', function () { setMode('OR'); });
    modeNotBtn.addEventListener('click', function () { setMode('NOT'); });

    // ── 13. Collapsible volumes ──
    // Adds a chevron to each volume header and toggles `.collapsed` on click.
    volumeBlocks.forEach(function (vol) {
        const volHeader = vol.querySelector('.volume-header');
        if (!volHeader) return;

        // Add chevron if not already present
        if (!volHeader.querySelector('.volume-chevron')) {
            const chev = document.createElement('span');
            chev.className = 'volume-chevron';
            chev.textContent = '▼';
            volHeader.appendChild(chev);
        }

        volHeader.addEventListener('click', function () {
            vol.classList.toggle('collapsed');
        });
    });

    // ── 14. Init ──
    function init() {
        collectTags();
        if (allTagData.length === 0) return;

        panel.classList.remove('collapsed');
        updateModeHint();
        renderTagCloud();
        applyFilters();
    }

    init();
})();