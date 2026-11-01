"""Test helper: give test users a saved squad so login goes straight to the home menu."""
import json

DEFAULT = {'penaltyOrder': ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], 'goalkeeperId': 'courtois', 'freeKickTakerId': 'messi'}


def seed_script(squads):
    """squads: {nickname: squad dict or None (→ DEFAULT)} → init script for a browser context"""
    data = {f'pipa.squad.v1.{nick.strip().lower()}': {**(sq or DEFAULT), 'selectedPlayers': (sq or DEFAULT)['penaltyOrder']} for nick, sq in squads.items()}
    return f"""(() => {{ try {{ const d = {json.dumps(data)}; for (const k in d) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(d[k])); }} catch (e) {{}} }})()"""
