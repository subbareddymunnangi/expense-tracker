<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyCXAAmIfT_IoaRk-bqZpF54Quq7HYXbjx4",
    authDomain: "knowyourexpense.firebaseapp.com",
    projectId: "knowyourexpense",
    storageBucket: "knowyourexpense.firebasestorage.app",
    messagingSenderId: "245849187585",
    appId: "1:245849187585:web:f26af2d8536ba37c3b2700",
    measurementId: "G-P9G1KHFG51"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>