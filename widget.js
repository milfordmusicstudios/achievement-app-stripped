// === widget.js ===
// Loads the Achievement App login widget into any website

(function () {
  // ---- 1. Create and inject style link ----
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'https://yourapp.com/style.css'; // ✅ change to your hosted CSS URL
  document.head.appendChild(style);

  // ---- 2. Create widget container ----
  const container = document.createElement('div');
  container.id = 'achievement-login-widget';
  container.innerHTML = `
    <main class="app" style="max-width:400px; margin:20px auto; background:white; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.2); padding:20px; font-family:Segoe UI, sans-serif;">
      <img src="https://yourapp.com/images/logos/logo.png" alt="App Logo" class="logo" style="width:200px; display:block; margin:10px auto;" />
      <h2 style="text-align:center; color:#00477d;">Achievement Awards</h2>

      <form id="widgetLoginForm">
        <input type="email" id="widgetEmail" placeholder="Email" required style="display:block;width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:8px;" />
        <input type="password" id="widgetPassword" placeholder="Password" required style="display:block;width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:8px;" />
        <div style="display:flex;justify-content:center;gap:10px;margin-top:10px;">
          <button type="submit" style="background:#00477d;color:white;padding:12px 20px;border:none;border-radius:8px;cursor:pointer;">Login</button>
          <button type="button" onclick="window.open('https://yourapp.com/signup.html','_blank')" style="background:#00477d;color:white;padding:12px 20px;border:none;border-radius:8px;cursor:pointer;">Sign Up</button>
        </div>
      </form>
      <p id="widgetLoginError" style="color:red; display:none; text-align:center;">Invalid email or password.</p>
    </main>
  `;
  document.body.appendChild(container);

  // ---- 3. Load Supabase client ----
  const supabaseScript = document.createElement('script');
  supabaseScript.type = 'module';
  supabaseScript.textContent = `
    import { supabase } from 'https://yourapp.com/supabase.js';

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

      // ✅ Store session & redirect to full app
      localStorage.setItem('supabaseSession', JSON.stringify(data));
      window.location.href = 'https://yourapp.com'; // ✅ redirect to your app home
    });
  `;
  document.body.appendChild(supabaseScript);
})();
