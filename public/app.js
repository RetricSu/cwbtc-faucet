const form = document.querySelector('#claim-form');
const message = document.querySelector('#message');
const claimAmount = document.querySelector('#claim-amount');
const faucetBalance = document.querySelector('#faucet-balance');
const turnstileMount = document.querySelector('#turnstile');
const copyButtons = document.querySelectorAll('[data-copy-target]');

let turnstileToken = '';

function showMessage(text, kind = '') {
  message.hidden = false;
  message.className = `message ${kind}`.trim();
  message.textContent = text;
}

function wireCopyButtons() {
  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const targetId = button.getAttribute('data-copy-target');
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        const previous = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => {
          button.textContent = previous;
        }, 1200);
      } catch {
        button.textContent = 'Copy failed';
      }
    });
  });
}

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

async function loadInfo() {
  const info = await jsonFetch('/api/info');
  claimAmount.textContent = info.amount_display;
  if (info.turnstile_required && info.turnstile_site_key) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.turnstile.render(turnstileMount, {
        sitekey: info.turnstile_site_key,
        callback: (token) => {
          turnstileToken = token;
        },
      });
    };
    document.head.appendChild(script);
  }
}

async function loadBalance() {
  try {
    const balance = await jsonFetch('/api/balance');
    faucetBalance.textContent = balance.configured ? balance.cwbtc_display : 'Not configured';
  } catch {
    faucetBalance.textContent = 'Unavailable';
  }
}

async function pollClaim(id) {
  for (;;) {
    const claim = await jsonFetch(`/api/claims/${id}`);
    if (claim.status === 'confirmed') {
      showMessage(`Claim confirmed: ${claim.amount_display}. CKB tx: ${claim.tx_hash}`, 'success');
      await loadBalance();
      return;
    }
    if (claim.status === 'failed') {
      showMessage(`Claim failed: ${claim.error || 'unknown error'}`, 'error');
      return;
    }
    showMessage(`Claim ${claim.status}. Waiting for CKB confirmation.`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const body = {
      address: new FormData(form).get('address'),
      turnstileToken,
    };
    const claim = await jsonFetch('/api/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showMessage(`Claim queued. Reference: ${claim.id}.`);
    await pollClaim(claim.id);
  } catch (err) {
    showMessage(err.message || 'Claim failed', 'error');
  } finally {
    button.disabled = false;
  }
});

await Promise.all([loadInfo(), loadBalance()]);
wireCopyButtons();
