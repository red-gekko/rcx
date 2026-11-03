from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "bloodhound-WIP.txt"
OUTPUT = ROOT / "episodes"

# ── Settings (mirror splitter.js defaults) ──
IGNORE_CUTOFF = False
INCLUDE_SCENE_HEADERS = True
INCLUDE_EPISODE_HEADERS = True
INCLUDE_VOLUME_HEADERS = True

CUTOFF_MARKER = "////"
RESUME_MARKER = "\\\\"

DIVIDER_RE = re.compile(r'^[\s\u00A0]*_+[\s\u00A0]*$')
SCENE_HEADER_RE = re.compile(r'^[\s\u00A0]*SCENE[\s\u00A0]*$', re.IGNORECASE)
VOLUME_RE = re.compile(r'^[\s\u00A0]*VOLUME\s*[-–—]\s*(.+?)\s*$', re.IGNORECASE)
EPISODE_RE = re.compile(r'^[\s\u00A0]*EPISODE\s*[-–—]\s*(.+?)\s*$', re.IGNORECASE)


# ── Parsing ────────────────────────────────────────────────────────────────
def parse_manuscript(text, ignore_cutoff):
    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    volumes = []
    current_volume = None
    current_episode = None

    in_scene = False
    scene_buffer = []
    redacting = False

    def resolve_scene_name_from_buffer():
        # strip trailing blanks
        while scene_buffer and scene_buffer[-1].strip() == '':
            scene_buffer.pop()
        if not scene_buffer:
            return ''
        candidate = scene_buffer[-1].strip()
        if (not candidate
                or DIVIDER_RE.match(candidate)
                or SCENE_HEADER_RE.match(candidate)
                or VOLUME_RE.match(candidate)
                or EPISODE_RE.match(candidate)
                or candidate == CUTOFF_MARKER
                or candidate == RESUME_MARKER):
            return ''
        if len(candidate) > 80:
            return ''
        if re.search(r'[,;]$', candidate):
            return ''
        scene_buffer.pop()
        while scene_buffer and scene_buffer[-1].strip() == '':
            scene_buffer.pop()
        return candidate

    def flush_scene(name):
        nonlocal in_scene, scene_buffer
        if not in_scene:
            return
        if current_episode is not None:
            current_episode['scenes'].append({'name': name or '', 'lines': list(scene_buffer)})
        in_scene = False
        scene_buffer = []

    for raw_line in lines:
        trimmed = raw_line.strip()

        # cutoff / resume
        if trimmed == CUTOFF_MARKER:
            if not ignore_cutoff:
                redacting = True
            continue
        if trimmed == RESUME_MARKER:
            redacting = False
            continue
        if redacting:
            continue

        # VOLUME
        m = VOLUME_RE.match(raw_line)
        if m:
            flush_scene(resolve_scene_name_from_buffer())
            current_episode = None
            current_volume = {'name': m.group(1).strip(), 'episodes': []}
            volumes.append(current_volume)
            continue

        # EPISODE
        m = EPISODE_RE.match(raw_line)
        if m:
            flush_scene(resolve_scene_name_from_buffer())
            if current_volume is None:
                current_volume = {'name': 'Unassigned', 'episodes': []}
                volumes.append(current_volume)
            current_episode = {'name': m.group(1).strip(), 'scenes': []}
            current_volume['episodes'].append(current_episode)
            continue

        # divider
        if DIVIDER_RE.match(raw_line):
            if in_scene:
                flush_scene(resolve_scene_name_from_buffer())
            continue

        # SCENE marker
        if SCENE_HEADER_RE.match(raw_line):
            if in_scene:
                flush_scene(resolve_scene_name_from_buffer())
            if current_episode is None:
                if current_volume is None:
                    current_volume = {'name': 'Unassigned', 'episodes': []}
                    volumes.append(current_volume)
                current_episode = {
                    'name': f"Episode {len(current_volume['episodes']) + 1}",
                    'scenes': [],
                }
                current_volume['episodes'].append(current_episode)
            in_scene = True
            scene_buffer = []
            continue

        # ordinary content
        if in_scene:
            scene_buffer.append(raw_line)

    if in_scene:
        flush_scene(resolve_scene_name_from_buffer())

    # trim leading/trailing blanks in each scene
    for vol in volumes:
        for ep in vol['episodes']:
            for scene in ep['scenes']:
                while scene['lines'] and scene['lines'][0].strip() == '':
                    scene['lines'].pop(0)
                while scene['lines'] and scene['lines'][-1].strip() == '':
                    scene['lines'].pop()

    return volumes


# ── Formatting ─────────────────────────────────────────────────────────────
def format_scene_lines(scene):
    out = []
    if INCLUDE_SCENE_HEADERS:
        out.append('SCENE - ' + scene['name'] if scene['name'] else 'SCENE')
        out.append('')
    for raw in scene['lines']:
        trimmed = raw.strip()
        if DIVIDER_RE.match(raw):
            continue
        if trimmed in (CUTOFF_MARKER, RESUME_MARKER):
            continue
        out.append('\t' + trimmed if trimmed else '')
    return out


def format_episode(ep, vol_name):
    header_parts = []
    if INCLUDE_VOLUME_HEADERS and vol_name and vol_name != 'Unassigned':
        header_parts.append('VOLUME - ' + vol_name)
    if INCLUDE_EPISODE_HEADERS:
        header_parts.append('EPISODE - ' + ep['name'])

    body = []
    for idx, scene in enumerate(ep['scenes']):
        if idx > 0:
            body.append('')
        formatted = format_scene_lines(scene)
        while formatted and formatted[-1] == '':
            formatted.pop()
        body.extend(formatted)

    while body and body[0] == '':
        body.pop(0)
    while body and body[-1] == '':
        body.pop()

    content = ''
    if header_parts:
        content += '\n'.join(header_parts) + '\n' + ('=' * 60) + '\n\n'
    content += '\n'.join(body) + '\n'
    return content


def sanitise(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '', name)
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'^\.+', '', name)
    name = re.sub(r'[. ]+$', '', name)
    return name.strip() or 'Untitled'


# ── Main ───────────────────────────────────────────────────────────────────
def split_story():
    text = SOURCE.read_text(encoding='utf-8')
    volumes = parse_manuscript(text, IGNORE_CUTOFF)

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    total = 0
    for vol_num, vol in enumerate(volumes):
        folder = OUTPUT / f"Volume {vol_num} - {sanitise(vol['name'])}"
        folder.mkdir()
        if not vol['episodes']:
            (folder / '_NO_EPISODES_FOUND.txt').write_text(
                f"No EPISODE headers were found under this volume.\nVolume: {vol['name']}\n",
                encoding='utf-8')
            continue
        for ep_num, ep in enumerate(vol['episodes'], start=1):
            fname = f"Episode {ep_num} - {sanitise(ep['name'])}.txt"
            content = format_episode(ep, vol['name'])
            (folder / fname).write_text(content, encoding='utf-8')
            total += 1

    print(f"Generated {total} episode files across {len(volumes)} volume(s).")


if __name__ == '__main__':
    split_story()