/* ============================================================
   BLOXBET — DEPOSIT MODAL
   ============================================================ */

(function(){
  if(typeof Auth === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    var overlay = document.getElementById('m-deposit');
    if(!overlay) return;

    // Upgrade markup once
    var modal = overlay.querySelector('.modal');
    if(modal && !modal.querySelector('.dep-hero')){
      modal.innerHTML =
        '<div class="dep-hero">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">' +
            '<div>' +
              '<h3>Add funds</h3>' +
              '<p>Top up RoCoins instantly. Minimum 100 RC.</p>' +
            '</div>' +
            '<button class="modal-close" type="button" onclick="Modal.close(\'m-deposit\')">' +
              '<img src="icons/close.png" alt="" class="ico" draggable="false">' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="dep-body">' +
          '<div class="dep-amount-wrap">' +
            '<label for="depositAmount">Amount</label>' +
            '<input type="number" id="depositAmount" value="1000" min="100" step="100" inputmode="numeric">' +
            '<span class="dep-unit">RC</span>' +
          '</div>' +
          '<div class="dep-quick">' +
            '<button type="button" data-deposit="500">500</button>' +
            '<button type="button" data-deposit="1000" class="active">1K</button>' +
            '<button type="button" data-deposit="5000">5K</button>' +
            '<button type="button" data-deposit="10000">10K</button>' +
            '<button type="button" data-deposit="25000">25K</button>' +
            '<button type="button" data-deposit="50000">50K</button>' +
            '<button type="button" data-deposit="100000">100K</button>' +
            '<button type="button" data-deposit="max">Max</button>' +
          '</div>' +
          '<div class="dep-preview">' +
            '<span class="lbl">New balance</span>' +
            '<span class="val" id="depPreview">—</span>' +
          '</div>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button class="btn btn-ghost" type="button" onclick="Modal.close(\'m-deposit\')">Cancel</button>' +
          '<button class="btn btn-primary" type="button" id="depositConfirmBtn">Add funds</button>' +
        '</div>';
    }

    var confirmBtn = document.getElementById('depositConfirmBtn');
    var amountInput = document.getElementById('depositAmount');
    var preview = document.getElementById('depPreview');
    var quickBtns = overlay.querySelectorAll('[data-deposit]');
    if(!confirmBtn || !amountInput) return;

    function currentBal(){
      try {
        var u = Auth.getUser();
        return u && u.balance != null ? Number(u.balance) : 0;
      } catch(e){ return 0; }
    }

    function updatePreview(){
      if(!preview) return;
      var amt = parseInt(amountInput.value, 10);
      if(!Number.isFinite(amt) || amt < 0) amt = 0;
      preview.textContent = (currentBal() + amt).toLocaleString() + ' RC';
    }

    amountInput.addEventListener('input', function(){
      quickBtns.forEach(function(b){ b.classList.remove('active'); });
      updatePreview();
    });

    quickBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        quickBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        var v = btn.dataset.deposit;
        if(v === 'max'){
          amountInput.value = String(Math.max(100, currentBal() * 10 || 100000));
        } else {
          amountInput.value = v;
        }
        updatePreview();
      });
    });

    // When modal opens, refresh preview
    var observer = new MutationObserver(function(){
      if(overlay.classList.contains('open') || overlay.style.display === 'flex') updatePreview();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });
    updatePreview();

    confirmBtn.addEventListener('click', async function(){
      var amount = parseInt(amountInput.value, 10);
      if(!Number.isFinite(amount) || amount < 100){
        Toast.error('Invalid amount', 'Minimum is 100 RoCoins.');
        return;
      }

      confirmBtn.disabled = true;
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
        Auth.updateUser({ balance: data.balance });
        if(typeof window.paintBalance === 'function') window.paintBalance(data.balance);

        Modal.close('m-deposit');
        Toast.success('Funds added', '+' + amount.toLocaleString() + ' RC');
        updatePreview();
      } catch (err) {
        Toast.error('Deposit failed', err.message || 'Try again.');
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Add funds';
      }
    });
  });
})();
