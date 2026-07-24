(() => {
  const root = document.documentElement;
  root.classList.add("funnel-auth-pending");

  const redirectToRegistration = () => {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/registrazione?next=${encodeURIComponent(current)}`);
  };

  fetch("/api/registration-session", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  })
    .then((response) => {
      if (!response.ok) throw new Error("registration-required");
      return response.json();
    })
    .then((payload) => {
      if (!payload?.authenticated) throw new Error("registration-required");
      root.classList.remove("funnel-auth-pending");
    })
    .catch(redirectToRegistration);
})();
