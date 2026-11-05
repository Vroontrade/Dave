# Zet de single-file build om naar een Claude Artifact-pagina (zonder eigen doctype/html/head/body).
import re, sys
src = open('dist-artifact/index.html', encoding='utf-8').read()
style = re.search(r'<style[^>]*>(.*?)</style>', src, re.S).group(1)
script = re.search(r'<script type="module"[^>]*>(.*?)</script>', src, re.S).group(1)
script = script.replace('</script', '<\\/script')
out = f'''<title>FINANCIAL RESET</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap">
<style>{style}</style>
<div id="root"></div>
<script type="module">{script}</script>
'''
open(sys.argv[1], 'w', encoding='utf-8').write(out)
print(len(out))
