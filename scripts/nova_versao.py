"""Marca uma versão nova do painel antes de publicar.

O GitHub Pages manda o navegador guardar os arquivos por até 10 minutos. Para quem já está com o
painel aberto (ou abriu há pouco) ver a versão nova, o painel compara a versão da página
(<meta name="versao"> no index.html) com o arquivo versao.txt, que ele busca sem cache.

Este script grava a mesma versão nos três lugares: versao.txt, a meta "versao" e o "?v=" do
estilo.css e do app.js no index.html. Rode antes de cada commit que vai para o ar:

    python scripts/nova_versao.py
"""
import re
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def main():
    versao = datetime.now().strftime("%Y-%m-%d.%H%M")
    (RAIZ / "versao.txt").write_text(versao + "\n", encoding="utf-8", newline="\n")
    idx = RAIZ / "index.html"
    s = idx.read_text(encoding="utf-8")
    s, n_meta = re.subn(r'<meta name="versao" content="[^"]*">', f'<meta name="versao" content="{versao}">', s)
    s, n_arq = re.subn(r'(href="estilo\.css|src="app\.js)(\?v=[^"]*)?"', lambda m: f'{m.group(1)}?v={versao}"', s)
    if n_meta != 1 or n_arq != 2:
        raise SystemExit(f"index.html fora do esperado (meta: {n_meta}, arquivos: {n_arq}); nada foi alterado nele.")
    idx.write_text(s, encoding="utf-8", newline="\n")
    print("versão", versao)


if __name__ == "__main__":
    main()
