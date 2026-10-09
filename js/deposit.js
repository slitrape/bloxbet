/* ============================================================
   BLOXBET — DEPOSIT MODAL HANDLER
   Wires the deposit modal (m-deposit) to /api/wallet/deposit
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('depositConfirmBtn');
    const amountInput = document.getElementById('depositAmount');
    const quickBtns = document.querySelectorAll('#m-deposit [data-deposit]');

    if(!confirmBtn || !amountInput) return;

    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        amountInput.value = btn.dataset.deposit;
      });
    });

    confirmBtn.addEventListener('click', async () => {
      const amount = parseInt(amountInput.value, 10);
      if(!Number.isFinite(amount) || amount < 100){
        Toast.error('Invalid amount', 'Minimum is 100 RoCoins.');
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<div class="spinner"></div><span>Processing…</span>';

      try {
        const res = await Auth.api('/wallet/deposit', {
          method: 'POST',
          body: JSON.stringify({ amount })
        });

        if(!res.ok){
          let err = 'DEPOSIT_FAILED';
          try { const j = await res.json(); err = j.error || err; } catch {}
          throw new Error(err);
        }

        const data = await res.json();
        Auth.updateUser({ balance: data.balance });
        document.querySelectorAll('[data-balance]').forEach(el => {
          el.textContent = Number(data.balance).toLocaleString();
          el.dataset.balance = data.balance;
        });

        Modal.close('m-deposit');
        Toast.success('Deposit complete', '+' + amount.toLocaleString() + ' RoCoins added.');
      } catch (err) {
        Toast.error('Deposit failed', err.message || 'Try again.');
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Confirm';
      }
    });
  });
})();