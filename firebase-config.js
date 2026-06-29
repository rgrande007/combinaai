// ============================================================
// Configuração do Firebase
// ============================================================
// Substitua os valores abaixo pelos dados do seu projeto.
// Para encontrá-los: Firebase Console > Configurações do
// projeto (ícone de engrenagem) > Seus apps > Web app.
// ============================================================

var firebaseConfig = {
  apiKey:            "AIzaSyBTnF9yzUPDqsm9rwpEFjhu0gfbYommAcw",
  authDomain:        "caledario-df4f1.firebaseapp.com",
  projectId:         "caledario-df4f1",
  storageBucket:     "caledario-df4f1.firebasestorage.app",
  messagingSenderId: "70565153528",
  appId:             "1:70565153528:web:388863ae11d7774376890d"
};

firebase.initializeApp(firebaseConfig);

// `db` é usado globalmente por app.js e admin.js
var db = firebase.firestore();
