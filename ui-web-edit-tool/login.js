const form = document.querySelector("[data-login-form]");
const errorNode = document.querySelector("[data-login-error]");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorNode.hidden = true;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const response = await fetch("/api/editor/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": window.location.origin
      },
      body: JSON.stringify({ password: form.elements.password.value })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Login failed.");
    window.location.assign("/editor/");
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.hidden = false;
    form.elements.password.focus();
  } finally {
    submit.disabled = false;
  }
});
