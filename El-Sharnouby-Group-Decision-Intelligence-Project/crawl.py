import json,sys,re,os
ROOT=os.path.dirname(os.path.abspath(__file__))
from playwright.sync_api import sync_playwright
VIEWS='exec,briefing,map,profit,discount,channels,customers,marketing,inventory,rebalance,factory,procurement,quality,whatif,warning,decisions,trust'.split(',')
out={}
def grab(pg,tag):
    raws=pg.evaluate('window.__units()')
    for r in raws: out.setdefault(r,set()).add(tag)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.goto('file://'+ROOT+'/dist/dashboard.html#exec'); pg.wait_for_timeout(800)
    for v in VIEWS:
        pg.evaluate(f"location.hash='#{v}'"); pg.wait_for_timeout(500); grab(pg,v)
        if v=='whatif':
            n=pg.evaluate("document.querySelectorAll('.seg button').length")
            for i in range(n):
                pg.evaluate(f"document.querySelectorAll('.seg button')[{i}].click()"); pg.wait_for_timeout(400); grab(pg,'whatif'+str(i))
        if v in('warning','decisions','inventory','factory','procurement','quality','customers','profit'):
            # expand 'show more' buttons
            pg.evaluate("document.querySelectorAll('button.btn.sm').forEach(b=>{if(/Show \\d+ more/.test(b.textContent)) b.click()})"); pg.wait_for_timeout(300); grab(pg,v+'+')
    # command palette
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(300); grab(pg,'cmdk')
    # dark/other filter: change period to ALL and family
    pg.keyboard.press('Escape')
    b.close()
import re
NUMRE=re.compile(r"(?<![A-Za-z0-9\-])(?:\d{4}-\d{2}-\d{2}|(?:EGP\s)?[−+]?\d[\d,]*(?:\.\d+)?(?:\s?(?:K|M|B|pp|x|ms|d|h|s)(?![A-Za-z])|%)?)")
keys={}
for raw,tags in out.items():
    core=raw.strip()
    core=re.sub(r"\s[↓↑]$","",core)
    if not re.search(r'[A-Za-z]',core): continue
    i=[0]
    def rep(m):
        i[0]+=1; return '{%d}'%i[0]
    k=NUMRE.sub(rep,core)
    if re.fullmatch(r'(\{\d+\}[\s·,/–\-—:()×]*)+',k): continue
    if re.fullmatch(r'[A-Z]{1,5}-?\d*[A-Za-z]?\d*',k) or re.fullmatch(r'[A-Z]{1,4}\d{2,}',k): continue
    keys.setdefault(k,sorted(tags)[:2])
json.dump(keys,open(os.path.join(ROOT,'i18n_keys.json'),'w'),ensure_ascii=False,indent=0)
print(len(out),'raw units ->',len(keys),'keys')
