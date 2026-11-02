"""Test helper: give test users a saved squad so login goes straight to the home menu."""
import json

DEFAULT = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}


def seed_script(squads):
    """squads: {nickname: squad dict or None (→ DEFAULT)} → init script for a browser context"""
    data = {f'pipa.squad.v1.{nick.strip().lower()}': {**(sq or DEFAULT), 'selectedPlayers': (sq or DEFAULT)['penaltyOrder']} for nick, sq in squads.items()}
    return f"""(() => {{ try {{ const d = {json.dumps(data)}; for (const k in d) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(d[k])); }} catch (e) {{}} }})()"""


# UPDATE 7: older tests don't care about the DAILY LOGIN popup — close it ("나중에") when it appears
NO_DAILY_JS = """(() => { new MutationObserver(() => {
    const d = document.querySelector('[data-testid=daily]');
    if (d) { const b = [...d.querySelectorAll('button')].find((x) => x.innerText.trim() === '나중에'); if (b) b.click(); }
  }).observe(document, { subtree: true, childList: true }); })()"""

import re as _re, os as _os
def game_version():
    src = open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', 'src', 'version.ts')).read()
    return int(_re.search(r'GAME_VERSION = (\d+)', src).group(1))
