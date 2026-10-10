/* ============================================================
   BLOXBET — DEPOSIT MODAL
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined') return;

  document.addEventListener('DOMContentLoaded', function(){
    var overlay = document.getElementById('m-deposit');
    if(!overlay) return;

    var amountInput = document.getElementById('depositAmount');
    var confirmBtn = document.getElementById('depositConfirmBtn');
    var preview = document.getElementById('depPreview');
    var quickBtns = overlay.querySelectorAll('[data-deposit]');
    var methodBtns = overlay.querySelectorAll('.dep-method');

    function currentBal(){
      try {
        var u = Auth.getUser && Auth.getUser();
        return Number(u && u.balance) || 0;
      } catch(e){ return 0; }
    }

    function updatePreview(){
      if(!amountInput) return;
      var amt = parseInt(amountInput.value, 10);
      if(!Number.isFinite(amt) || amt < 0) amt = 0;
      if(preview) preview.textContent = (currentBal() + amt).toLocaleString() + ' RC';
    }

    if(amountInput){
      amountInput.addEventListener('input', function(){
        quickBtns.forEach(function(b){ b.classList.remove('active'); });
        updatePreview();
      });
    }

    quickBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        quickBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var v = btn.getAttribute('data-deposit');
        if(!amountInput) return;
        if(v === 'max'){
          amountInput.value = String(Math.max(100, currentBal() * 10 || 100000));
        } else {
          amountInput.value = v;
        }
        updatePreview();
      });
    });

    methodBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        methodBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    var observer = new MutationObserver(function(){
      if(overlay.classList.contains('open') || overlay.style.display === 'flex') updatePreview();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });
    updatePreview();

    if(confirmBtn){
      confirmBtn.addEventListener('click', async function(){
        var amount = parseInt(amountInput && amountInput.value, 10);
        if(!Number.isFinite(amount) || amount < 7){
          if(window.Toast) Toast.error('Invalid amount', 'Minimum is 7 BC.');
          return;
        }

        confirmBtn.disabled = true;
        var prev = confirmBtn.innerHTML;
        confirmBtn.innerHTML = '<div class="spinner"></div><span>Processing…</span>';

        try {
          var res = await Auth.api('/wallet/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount: amount })
          });

          if(!res.ok){
            var err = 'DEPOSIT_FAILED';
            try { var j = await res.json(); err = j.error || err; } catch(e){}
            throw new Error(err);
          }

          var data = await res.json();
          Auth.updateUser({ balance: data.balance, bloxCoins: data.bloxCoins });
          if(typeof window.paintBalance === 'function' && data.balance != null) window.paintBalance(data.balance);

          if(window.Modal) Modal.close('m-deposit');
          if(window.Toast) Toast.success('Deposit', '+' + amount.toLocaleString() + ' BC');
          updatePreview();
        } catch (err) {
          if(window.Toast) Toast.error('Deposit failed', err.message || 'Try again.');
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = prev || 'Add Funds';
        }
      });
    }
  });
})();
