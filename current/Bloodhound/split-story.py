
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "bloodhound-WIP.txt"
OUTPUT = ROOT / "episodes"

def is_heading(line, heading):
    return line.strip().startswith(heading)

def safe_filename(text):
    text = text.strip()
    text = re.sub(r"^EPISODE\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r'[<>:"/\\|?*]', "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-_.")[:70] or "untitled"

def split_story():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    current_volume = ""
    current_episode = None
    episodes = []
    front_matter = []

    for line in lines:
        if is_heading(line, "VOLUME"):
            current_volume = line
            continue

        if is_heading(line, "EPISODE"):
            if current_episode is not None:
                episodes.append(current_episode)

            current_episode = {
                "volume": current_volume,
                "lines": [line],
            }
            continue

        if current_episode is not None:
            current_episode["lines"].append(line)
        else:
            front_matter.append(line)

    if current_episode is not None:
        episodes.append(current_episode)

    # Preserve material before the first episode.
    if front_matter:
        (OUTPUT / "000-front-matter.txt").write_text(
            "\n".join(front_matter).rstrip() + "\n",
            encoding="utf-8"
        )

    for number, episode in enumerate(episodes, start=1):
        content = []

        if episode["volume"]:
            content.append(episode["volume"])
            content.append("")

        content.extend(episode["lines"])

        # Use the episode heading as the filename.
        heading = episode["lines"][0].strip()
        filename = f"{number:03d}-{safe_filename(heading)}.txt"

        (OUTPUT / filename).write_text(
            "\n".join(content).rstrip() + "\n",
            encoding="utf-8"
        )

    print(f"Generated {len(episodes)} episode files.")

if __name__ == "__main__":
    split_story()
