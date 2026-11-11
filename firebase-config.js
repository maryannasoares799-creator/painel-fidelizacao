/* Ligação do painel com o projeto Firebase.
   Cole aqui os valores do bloco "firebaseConfig" que o Firebase mostra quando você registra o app da web
   (Configurações do projeto > Seus apps). Esses valores não são senha: quem protege os dados é o login
   com a conta da empresa e as regras do banco (arquivo firestore.rules). */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAmm7DJxLBOUs86wXAOB1dRFz8xgixBKrM",
  authDomain: "painel-fidelizacao.firebaseapp.com",
  projectId: "painel-fidelizacao",
  storageBucket: "painel-fidelizacao.firebasestorage.app",
  messagingSenderId: "782961325361",
  appId: "1:782961325361:web:878efcc8b2054482006c10",
};

/* Só entra quem tem e-mail deste domínio. */
window.DOMINIO_EMPRESA = "solucoesindustriais.com.br";
