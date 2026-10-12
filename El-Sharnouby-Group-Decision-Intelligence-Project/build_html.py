import json, glob, os, base64, sys
ROOT=os.path.dirname(os.path.abspath(__file__)); W=f'{ROOT}/web'
FONT_DIR=os.environ.get('ESG_FONTS',os.path.join(ROOT,'fonts'))   # user-supplied licensed fonts; NOT shipped in the project
if not os.path.exists(f'{ROOT}/dist/data.json'): sys.exit('dist/data.json not found - run pipeline/build.py first')
data=open(f'{ROOT}/dist/data.json',encoding='utf-8').read().replace('</','<\\/')
ar=open(f'{ROOT}/web/ar.json',encoding='utf-8').read().replace('</','<\\/') if os.path.exists(f'{ROOT}/web/ar.json') else '{}'
css=open(f'{W}/dashboard.css').read()
order=['core.js','main.js','i18n.js']+sorted(os.path.basename(p) for p in glob.glob(f'{W}/views_*.js'))
js='\n'.join(open(f'{W}/{f}',encoding='utf-8').read() for f in order if os.path.exists(f'{W}/{f}'))
FONTS=[('Thmanyah Sans',400,'thmanyahsans/woff2/thmanyahsans-Regular.woff2'),('Thmanyah Sans',500,'thmanyahsans/woff2/thmanyahsans-Medium.woff2'),('Thmanyah Sans',700,'thmanyahsans/woff2/thmanyahsans-Bold.woff2'),
       ('Thmanyah Serif Display',700,'thmanyahserifdisplay/woff2/thmanyahserifdisplay-Bold.woff2'),('Thmanyah Serif Display',900,'thmanyahserifdisplay/woff2/thmanyahserifdisplay-Black.woff2')]
def obf(b): return base64.b64encode(bytes(c^((0x5A+i%7)&255) for i,c in enumerate(b))).decode()
fl=[]
for n,w,p in FONTS:
    fp=os.path.join(FONT_DIR,p)
    if os.path.exists(fp): fl.append([n,w,obf(open(fp,'rb').read())])
    else: print('font missing, using fallback:',fp,file=sys.stderr)
fontjs='''(function(){var F=%s;function d(b){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i)^((90+(i%%7))&255);return u;}
F.forEach(function(f){try{var url=URL.createObjectURL(new Blob([d(f[2])],{type:'font/woff2'}));var ff=new FontFace(f[0],'url('+url+') format("woff2")',{weight:String(f[1])});ff.load().then(function(x){document.fonts.add(x);}).catch(function(){});}catch(e){}});})();'''%json.dumps(fl)
EMBED=f'{ROOT}/assets/font_embed.html'   # fonts already embedded in the shipped build; reused when the licensed font files are not on this machine
fontblock=f'<script>{fontjs}</script>' if fl else (open(EMBED,encoding='utf-8').read() if os.path.exists(EMBED) else '')
html=f'''<title>El-Sharnouby Group Decision Intelligence Project</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>{css}</style>
<div id="root"></div>
{fontblock}
<script>window.ESG_AR={ar};window.ESG_DATA={data};</script>
<script>
{js}
document.addEventListener('DOMContentLoaded',boot);
if(document.readyState!=='loading') boot();
</script>
'''
open(f'{ROOT}/dist/dashboard.html','w',encoding='utf-8').write(html)
print(round(len(html)/1e6,2),'MB')
