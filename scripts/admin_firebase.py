"""Administração do banco do Painel de Fidelização (Firestore).

Usa a chave de acesso do Firebase (conta de serviço). A chave dá acesso total ao banco:
guarde-a fora da pasta do repositório e nunca a envie para o GitHub.

Instalação (uma vez):
    python -m pip install firebase-admin

Comandos:
    python scripts/admin_firebase.py --chave C:/caminho/chave.json importar PASTA
        Grava no banco todos os arquivos PASTA/<coleção>/<id>.json (o formato da exportação do painel antigo).
    python scripts/admin_firebase.py --chave ... exportar PASTA
        Salva uma cópia de segurança de todas as coleções em PASTA/<coleção>/<id>.json.
    python scripts/admin_firebase.py --chave ... gravar ARQUIVO.json
        Aplica uma lista de escritas: [{"op": "set"|"update"|"delete", "collection": "...", "doc_id": "...", "data": {...}}]
    python scripts/admin_firebase.py --chave ... operador adicionar EMAIL [NOME]
    python scripts/admin_firebase.py --chave ... operador remover EMAIL
    python scripts/admin_firebase.py --chave ... operador listar
"""
import argparse
import json
import sys
from pathlib import Path

COLECOES = ["pastas", "disparos", "leads", "bases", "institucional", "coldzap", "coldzap_leads", "operadores"]


def conectar(chave):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        sys.exit("Falta instalar o firebase-admin: python -m pip install firebase-admin")
    caminho = Path(chave)
    if not caminho.is_file():
        sys.exit(f"Chave não encontrada: {caminho}")
    firebase_admin.initialize_app(credentials.Certificate(str(caminho)))
    return firestore.client()


def em_lotes(db, escritas, tamanho=400):
    """Aplica escritas em lotes atômicos de até `tamanho` operações."""
    total = 0
    for i in range(0, len(escritas), tamanho):
        lote = db.batch()
        for e in escritas[i:i + tamanho]:
            ref = db.collection(e["collection"]).document(e["doc_id"])
            op = e.get("op", "set")
            if op == "set":
                lote.set(ref, e["data"])
            elif op == "update":
                lote.update(ref, e["data"])
            elif op == "delete":
                lote.delete(ref)
            else:
                sys.exit(f"Operação desconhecida: {op}")
        lote.commit()
        total += len(escritas[i:i + tamanho])
    return total


def importar(db, pasta):
    pasta = Path(pasta)
    escritas = []
    for col in COLECOES:
        for arq in sorted((pasta / col).glob("*.json")):
            dados = json.loads(arq.read_text(encoding="utf-8"))
            escritas.append({"op": "set", "collection": col, "doc_id": arq.stem, "data": dados})
    if not escritas:
        sys.exit(f"Nenhum arquivo encontrado em {pasta}/<coleção>/*.json")
    n = em_lotes(db, escritas)
    contagem = {}
    for e in escritas:
        contagem[e["collection"]] = contagem.get(e["collection"], 0) + 1
    print(f"{n} documentos gravados:", ", ".join(f"{c} {q}" for c, q in contagem.items()))


def exportar(db, pasta):
    pasta = Path(pasta)
    total = 0
    for col in COLECOES:
        destino = pasta / col
        destino.mkdir(parents=True, exist_ok=True)
        for doc in db.collection(col).stream():
            (destino / f"{doc.id}.json").write_text(json.dumps(doc.to_dict(), ensure_ascii=False, indent=1, default=str), encoding="utf-8")
            total += 1
    print(f"{total} documentos salvos em {pasta}")


def gravar(db, arquivo):
    escritas = json.loads(Path(arquivo).read_text(encoding="utf-8"))
    print(f"{em_lotes(db, escritas)} escritas aplicadas")


def operador(db, acao, email=None, nome=""):
    col = db.collection("operadores")
    if acao == "listar":
        for doc in col.stream():
            print(doc.id, "-", doc.to_dict().get("nome", ""))
        return
    if not email:
        sys.exit("Informe o e-mail.")
    email = email.strip().lower()
    if acao == "adicionar":
        col.document(email).set({"nome": nome})
        print(f"{email} agora é operador.")
    elif acao == "remover":
        col.document(email).delete()
        print(f"{email} não é mais operador.")


def main():
    p = argparse.ArgumentParser(description="Administração do banco do Painel de Fidelização")
    p.add_argument("--chave", required=True, help="caminho da chave de acesso do Firebase (JSON)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("importar").add_argument("pasta")
    sub.add_parser("exportar").add_argument("pasta")
    sub.add_parser("gravar").add_argument("arquivo")
    po = sub.add_parser("operador")
    po.add_argument("acao", choices=["adicionar", "remover", "listar"])
    po.add_argument("email", nargs="?")
    po.add_argument("nome", nargs="?", default="")
    a = p.parse_args()
    db = conectar(a.chave)
    if a.cmd == "importar":
        importar(db, a.pasta)
    elif a.cmd == "exportar":
        exportar(db, a.pasta)
    elif a.cmd == "gravar":
        gravar(db, a.arquivo)
    elif a.cmd == "operador":
        operador(db, a.acao, a.email, a.nome)


if __name__ == "__main__":
    main()
