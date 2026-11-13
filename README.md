# Painel de Fidelização · Soluções Industriais

Painel do time de Growth com três frentes em abas:

- **Fidelização:** disparos de e-mail e WhatsApp para quem já cotou no site, organizados por produto (pastas > disparos > leads).
- **Institucional:** disparos por segmento, sem fornecedor específico. Cada disparo é uma linha, com o funil do BillionMail e o retorno.
- **ColdZap:** o WhatsApp manual dos cold mails por fornecedor, acompanhado lead a lead (envio, resposta e orçamento).

Abre em qualquer navegador. Para entrar, a pessoa digita o e-mail **@solucoesindustriais.com.br** e recebe um link de acesso no Outlook. Depois de entrar, continua logada naquele navegador. A dona do projeto entra com a conta Google, em "Administração do painel: entrar com Google".

| Quem | O que pode fazer |
|---|---|
| Qualquer pessoa com e-mail da empresa | Ver os números das três frentes |
| Operadores (lista no banco, por e-mail) | Ver nome, e-mail e celular dos leads, marcar envio, resposta e orçamento, e lançar disparos institucionais |

No plano gratuito do Firebase, o projeto envia **no máximo 5 e-mails de link de acesso por dia**, somando todo mundo. Cada pessoa só precisa de um link por navegador, então convide o time aos poucos.

## Como funciona

- **Este repositório** guarda só o código da página. Nenhum dado de lead fica aqui.
- **GitHub Pages** publica a página. É o link que as pessoas abrem.
- **Firebase (Google)** cuida do login e guarda os dados no banco Firestore. As regras do banco (`firestore.rules`) garantem que só entra quem é da empresa e que só operadores veem os dados dos leads.

Arquivos:

| Arquivo | Para que serve |
|---|---|
| `index.html`, `estilo.css`, `app.js` | A página |
| `firebase-config.js` | Liga a página ao projeto Firebase (não é senha) |
| `firestore.rules` | Regras de acesso, coladas no console do Firebase |
| `scripts/admin_firebase.py` | Importar e exportar dados e gerenciar operadores |

## Montagem (uma vez)

### 1. Firebase

Faça tudo com a conta Google dona do projeto, em https://console.firebase.google.com.

1. **Criar projeto:** clique em "Criar projeto" e dê o nome `painel-fidelizacao`. O Google Analytics pode ficar desativado, e o plano é o **Spark** (gratuito).
2. **Login:** abra Segurança > Authentication > Vamos começar > aba **Método de login** e ative dois métodos:
   - **E-mail/senha:** ative a primeira chave e também **Link do e-mail (login sem senha)**, depois salve. É por aqui que o time entra.
   - **Google:** ative, escolha o e-mail de suporte e salve. É por aqui que a dona do projeto entra.
3. **Domínio do site:** em Authentication > Configurações > Domínios autorizados, adicione `SEU-USUARIO.github.io`, com o seu usuário do GitHub.
4. **Banco:** abra Firestore Database > Criar banco de dados. Escolha o local `southamerica-east1 (São Paulo)` e o **modo de produção**.
5. **Regras:** no Firestore, abra a aba **Regras**, apague o que estiver lá, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
6. **Configuração da página:** vá na engrenagem > Configurações do projeto > Seus apps e clique no ícone **</>** (Web). Dê o apelido `painel` e registre, sem marcar o Hosting. Copie o bloco `firebaseConfig` para `firebase-config.js`.
7. **Chave de administração:** vá em Configurações do projeto > Contas de serviço > **Gerar nova chave privada**. Salve o arquivo em `Documentos\CLAUDE\chaves\`, **fora** desta pasta. Essa chave dá acesso total ao banco: não envie para ninguém e não coloque no GitHub.

### 2. Dados e operadores

```bash
python -m pip install firebase-admin
python scripts/admin_firebase.py --chave "C:/Users/.../CLAUDE/chaves/CHAVE.json" importar CAMINHO_DA_EXPORTACAO
python scripts/admin_firebase.py --chave "C:/Users/.../CLAUDE/chaves/CHAVE.json" operador adicionar email@solucoesindustriais.com.br "Nome"
```

A conta Google da dona do projeto também precisa entrar na lista de operadores. Sem isso, o painel não deixa ela entrar, porque o e-mail não é da empresa.

### 3. GitHub

1. Em https://github.com/new, crie o repositório `painel-fidelizacao` como **Public**, sem README.
2. Suba o código desta pasta (`git push`).
3. No repositório, abra Settings > Pages. Em Source, escolha **Deploy from a branch**, depois a branch `main` e a pasta `/ (root)`, e salve.
4. Em alguns minutos o painel abre em `https://SEU-USUARIO.github.io/painel-fidelizacao/`.

No GitHub gratuito, o GitHub Pages só publica repositório público. Por isso o código fica visível, mas os dados ficam no Firebase, atrás do login e das regras.

## No dia a dia

- **Marcações:** envio, respostas e orçamentos são marcados só aqui. O painel antigo, no Claude, fica como cópia de segurança.
- **Dados novos:** listas de ColdZap, disparos de fidelização e "voltou a cotar" entram pelo script `admin_firebase.py` (comando `gravar`).
- **Cópia de segurança:** `python scripts/admin_firebase.py --chave ... exportar PASTA`.
- **Operadores:** para dar ou tirar acesso aos leads, use `operador adicionar` ou `operador remover`.
- **Publicar uma mudança no painel:** rode `python scripts/nova_versao.py` antes do commit e depois faça o `git push`. O script marca uma versão nova, e quem estiver com o painel aberto ou com a página guardada no navegador passa a ver a versão nova sozinho: ao abrir, o painel recarrega; se já estiver aberto, aparece o aviso "Atualizar".
