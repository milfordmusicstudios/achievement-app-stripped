// === widget.js ===
// Loads the Achievement App login widget into any website

(function () {
  // ---- 1. Inject style link to use app CSS ----
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'https://achievement-app-stripped.vercel.app/style.css';
  document.head.appendChild(style);

  // ---- 2. Create widget container with white background ----
  const container = document.createElement('div');
  container.id = 'achievement-login-widget';
  container.style.background = "white";
  container.style.padding = "40px 0";
  container.style.width = "100%";
  container.style.display = "flex";
  container.style.justifyContent = "center";

  container.innerHTML = `
    <div style="background:white; max-width:400px; width:90%; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.2); padding:20px;" class="white-page">
      <main class="app">
        <img src="https://achievement-app-stripped.vercel.app/images/logos/amplified.png" 
             alt="App Logo" class="logo" />
        <h2 class="welcome-title" style="color:#3eb7f8; text-align:center;">Achievement Awards</h2>

        <form id="widgetLoginForm">
          <input type="email" id="widgetEmail" placeholder="Email" required class="white-input" />
          <input type="password" id="widgetPassword" placeholder="Password" required class="white-input" />
          <div style="display:flex;justify-content:center;gap:10px;margin-top:10px;">
            <button type="submit" class="blue-button">Login</button>
            <button type="button" class="blue-button" onclick="window.open('https://achievement-app-stripped.vercel.app/signup.html','_blank')">Sign Up</button>
          </div>
        </form>
        <p id="widgetLoginError" style="color:red; display:none; text-align:center;">Invalid email or password.</p>
      </main>
    </div>
  `;

  // ---- 3. Place widget in placeholder (and remove loading text) ----
  const placeholderContainer = document.getElementById('achievement-login-widget-container');
  if (placeholderContainer) {
    placeholderContainer.innerHTML = '';      // ✅ remove "Loading login widget..."
    placeholderContainer.appendChild(container);
  } else {
    document.body.appendChild(container);     // fallback
  }

  // ---- 4. Load Supabase login logic ----
  const supabaseScript = document.createElement('script');
  supabaseScript.type = 'module';
  supabaseScript.textContent = `
    import { supabase } from 'https://achievement-app-stripped.vercel.app/supabase.js';

    const form = document.getElementById('widgetLoginForm');
    const errorDisplay = document.getElementById('widgetLoginError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('widgetEmail').value.trim().toLowerCase();
      const password = document.getElementById('widgetPassword').value;

      if (!email || !password) {
        errorDisplay.style.display = 'block';
        errorDisplay.textContent = 'Please enter both email and password.';
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        errorDisplay.style.display = 'block';
        errorDisplay.textContent = 'Invalid email or password.';
        return;
      }

      // ✅ Store session & redirect to your app
      localStorage.setItem('supabaseSession', JSON.stringify(data));
      window.location.href = 'https://achievement-app-stripped.vercel.app';
    });
  `;
  document.body.appendChild(supabaseScript);
})();
