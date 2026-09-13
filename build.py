#!/usr/bin/env python3
"""Build Teddy's Training Year from data/*.json.

Outputs
  dist/artifact.html      fragment (no doctype/head/body) for publishing with the claude.ai Artifact tool
  site/index.html         standalone page for Vercel or any static host
  docs/plans/<month>.md   markdown export of the month's weeks and the current week's daily cards

Usage
  python3 build.py                 # builds the plan named in data/current.json
  python3 build.py 2026-10         # builds a specific month plan
"""
import json, re, sys, pathlib, html

ROOT = pathlib.Path(__file__).parent
program = json.loads((ROOT / "data/program.json").read_text())
current = json.loads((ROOT / "data/current.json").read_text())
drills = json.loads((ROOT / "data/drills.json").read_text())
month = sys.argv[1] if len(sys.argv) > 1 else current["plan"]
plan = json.loads((ROOT / f"data/plans/{month}.json").read_text())

# ---------------------------------------------------------------- drill linker
# Every drill name and alias becomes a match term. Cards are written as plain
# prose, so the glossary is attached here rather than marked up by hand in the
# plan JSON; that way every future month inherits it for free.


def build_matcher(drills):
    terms = []
    for slug, entry in drills.items():
        for term in [entry["name"]] + entry.get("aliases", []):
            terms.append((term, slug))
    terms.sort(key=lambda t: -len(t[0]))          # longest match wins
    lookup, alts = {}, []
    for i, (term, slug) in enumerate(terms):
        group = f"t{i}"
        lookup[group] = slug
        alts.append(f"(?P<{group}>{re.escape(term)}(?:e?s)?)")   # tolerate plurals
    # \w and - on both sides so "pass" never matches inside "passing"
    return re.compile(r"(?<![\w-])(?:" + "|".join(alts) + r")(?![\w-])", re.I), lookup


TERM_RE, TERM_SLUG = build_matcher(drills)


def link_terms(text, found=None):
    """Wrap the first mention of each drill. Never touches HTML tags.

    Pass a shared `found` list to treat a block's title and cue as one unit, so a
    drill named in both is linked once, on the title."""
    found = [] if found is None else found
    out = []
    for part in re.split(r"(<[^>]+>)", text):
        if part.startswith("<"):
            out.append(part)
            continue

        def repl(m):
            slug = TERM_SLUG[m.lastgroup]
            if slug in found:                      # one link per block, not per word
                return m.group(0)
            found.append(slug)
            return f'<button type="button" class="term" data-drill="{slug}">{m.group(0)}</button>'

        out.append(TERM_RE.sub(repl, part))
    return "".join(out), found


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


bare = []
for day in plan["cards"]["days"]:
    day_slugs = []
    for blk in day["blocks"]:
        found = []
        # Titles carry drill names too ("Test: Dead hang"), so they are escaped
        # here and linked; the template prints blk[1] raw because of this.
        blk[1], _ = link_terms(html.escape(blk[1], quote=False), found)
        if len(blk) > 2 and blk[2]:
            blk[2], _ = link_terms(blk[2], found)
        for slug in found:
            if slug not in day_slugs:
                day_slugs.append(slug)
        if not found:
            bare.append(f"{day['dow']} · {strip(blk[1])}")
    day["drills"] = day_slugs                      # powers the diary's rating chips

used = {s for day in plan["cards"]["days"] for s in day["drills"]}

data = {
    "BLOCKS": program["blocks"], "AREAS": program["areas"], "CELLS": program["cells"],
    "PATCHES": program["patches"], "GATES": program["gates"], "BATTERY": program["battery"],
    "ROLES": program["roles"], "ORG": program["org"], "LEVEL": program["level"], "LEVELNAME": program["levelName"],
    "WEEKS": plan["weeks"], "CARDS": plan["cards"]["days"], "DRILLS": drills,
    "SHEETROWS": program["sheetRows"], "RANKRULE": program["rankRule"],
}
template = (ROOT / "src/page.html").read_text()
page = template.replace("__DATA__", json.dumps(data, ensure_ascii=False))
page = page.replace("Cub block · Weeks 1–3</h2><span class=\"small muted\">Sep 14 – Oct 4.",
                    f"{plan['label']}</h2><span class=\"small muted\">{plan['range']}.")

(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist/artifact.html").write_text(page)

# Standalone document. Mirrors the small reset the Artifact host applies.
# The template's <title>, <link>, and <style> sit at the top of the fragment; move them into <head>.
head_bits = re.findall(r"<title>.*?</title>|<link[^>]*>|<style>.*?</style>", page, flags=re.S)
body = page
for b in head_bits:
    body = body.replace(b, "", 1)
standalone = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
    "<meta name=\"color-scheme\" content=\"light dark\">\n"
    "<style>body{margin:0;font-family:system-ui;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style>\n"
    + "\n".join(head_bits) + "\n</head>\n<body>\n" + body.strip() + "\n</body>\n</html>\n"
)
(ROOT / "site").mkdir(exist_ok=True)
(ROOT / "site/index.html").write_text(standalone)

# Markdown export
md = [f"# {plan['label']} ({plan['range']})", ""]
roles = {r[0]: r for r in program["roles"]}
for w in plan["weeks"]:
    md += [f"## Week {w['n']}: {w['theme']} ({w['dates']})", "",
           "Sub-targets: " + "; ".join(w["targets"]), "",
           f"Challenge of the week: {w['challenge']}", ""]
    for dow, dn, title, items in w["days"]:
        r = roles[dow]
        org = ", ".join(program["org"][dow]) or "no organized activity"
        mins = "home off" if r[3] == "off" else f"{r[3]} min"
        md.append(f"- **{dow} {dn} · {r[1]} · {title}** ({org}; {mins}): " + "; ".join(items))
    md.append("")
c = plan["cards"]
md += [f"## Daily cards, Week {c['week']}: {c['theme']} ({c['dates']})", ""]
for d in c["days"]:
    mins = "home off" if d["mins"] == "off" else f"{d['mins']} min"
    md += [f"### {d['dow']} {d['date']} · {d['role']} · {d['name']} ({mins})", ""]
    for blk in d["blocks"]:
        m, n, cue = blk[0], strip(blk[1]), blk[2]
        tag = blk[3] if len(blk) > 3 else ""
        label = f"{n}" + (" [battery]" if tag == "test" else " [challenge]" if tag == "ch" else "")
        md.append(f"- **{m}{'' if m == '—' else ' min'} · {label}**" + (f": {strip(cue)}" if cue else ""))
    md += ["", f"Dad notes: {d['dad']}", ""]

# Glossary appendix: only the drills this week actually uses.
if used:
    md += ["## Drill glossary, this week", ""]
    for area in [a["n"] for a in program["areas"]]:
        rows = sorted((s for s in used if drills[s]["area"] == area), key=lambda s: drills[s]["name"])
        if not rows:
            continue
        md.append(f"**{area}**")
        md.append("")
        for slug in rows:
            e = drills[slug]
            md.append(f"- **{e['name']}.** {e['short']} Watch for: {e['watch']} Cue: \"{e['cue']}\"")
        md.append("")

(ROOT / "docs/plans").mkdir(parents=True, exist_ok=True)
(ROOT / f"docs/plans/{month}.md").write_text("\n".join(md))
print(f"built {month}: dist/artifact.html, site/index.html, docs/plans/{month}.md")
print(f"glossary: {len(drills)} entries, {len(used)} used in this week's cards")
if bare:
    print(f"no drill matched in {len(bare)} block(s): " + "; ".join(bare))
