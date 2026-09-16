document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('fetch-form');
  const input = document.getElementById('fb-input');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');
  const pasteBtn = document.getElementById('paste-btn');
  
  const errorBox = document.getElementById('error-box');
  const resultBox = document.getElementById('result-box');
  const avatarImg = document.getElementById('avatar-img');
  const silhouetteNotice = document.getElementById('silhouette-notice');
  const profileName = document.getElementById('profile-name');
  const metaTarget = document.getElementById('meta-target');
  const metaMethod = document.getElementById('meta-method');
  const metaRes = document.getElementById('meta-res');
  const resultDescription = document.getElementById('result-description');
  const downloadBtn = document.getElementById('download-btn');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const openLinkBtn = document.getElementById('open-link-btn');
  const toast = document.getElementById('toast');
  const inputGuidance = document.getElementById('input-guidance');

  let currentImageUrl = '';
  let currentProxyUrl = '';

  // Ensure clean state on load
  hideError();
  hideResult();

  // Clear errors when user types
  input.addEventListener('input', () => {
    hideError();
    updateInputGuidance(input.value);
  });

  // Quick sample chips
  document.querySelectorAll('.sample-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.sample;
      input.focus();
      hideError();
      updateInputGuidance(input.value);
    });
  });

  // Paste from clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text.trim();
        input.focus();
        hideError();
        updateInputGuidance(input.value);
        showToast('Pasted from clipboard!');
      }
    } catch (err) {
      showToast('Clipboard access denied.');
    }
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) {
      showError('Please enter a Facebook Profile ID, Username, or Link.');
      return;
    }

    setLoading(true);
    hideError();
    hideResult();

    try {
      const response = await fetch('/api/get-profile-picture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: query,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const error = new Error(data.error || 'Failed to retrieve Facebook profile picture.');
        error.reason = data.reason;
        throw error;
      }

      displayResult(data);
    } catch (err) {
      console.error(err);
      showError(err.message || 'An unexpected error occurred while fetching the profile picture.');
      if (err.reason === 'login_wall') {
        showUsernameHelp();
      }
    } finally {
      setLoading(false);
    }
  });

  // When a username/link cannot be resolved from this server, point the user to
  // the "Run it locally" section on the page.
  function showUsernameHelp() {
    const content = errorBox.querySelector('.error-text-content');
    if (!content) return;
    const hint = document.createElement('div');
    hint.className = 'resolver-hint';
    hint.append('Tip: this works reliably when the app is run locally.');

    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'resolver-link';
    link.textContent = 'See how to run it locally ↓';
    link.addEventListener('click', () => {
      document.querySelector('.local-run')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    hint.appendChild(link);
    content.appendChild(hint);
  }

  // Copy the stable server proxy URL (the direct FB CDN URL expires and is hotlink-protected).
  copyLinkBtn.addEventListener('click', async () => {
    const copyValue = currentProxyUrl || currentImageUrl;
    if (!copyValue) return;
    const absoluteUrl = new URL(copyValue, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      showToast('Download link copied to clipboard!');
    } catch (err) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = absoluteUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Download link copied!');
    }
  });

  function displayResult(data) {
    currentImageUrl = data.imageUrl;
    currentProxyUrl = data.proxyDownloadUrl || '';
    // Display through the inline proxy: lookaside URLs reject browser UAs, so
    // loading them directly would show a broken image.
    const displaySrc = data.displayProxyUrl || data.imageUrl;
    avatarImg.onerror = () => {
      if (currentImageUrl && !resultBox.classList.contains('hidden')) {
        hideResult();
        showError('The profile picture could not be loaded from Facebook servers. The image link may have expired or access was blocked.');
      }
    };
    avatarImg.src = displaySrc;
    profileName.textContent = data.name || (data.targetType === 'numeric_id' ? `User ID: ${data.target}` : `@${data.target}`);
    metaTarget.textContent = `Target: ${data.target}`;
    metaMethod.textContent = `Source: ${data.method}`;

    if (metaRes) {
      if (data.mxResolution) {
        metaRes.textContent = `Quality: ${data.mxResolution} (HD)`;
        metaRes.classList.remove('hidden');
      } else {
        metaRes.textContent = `Quality: Standard`;
      }
    }

    if (data.isSilhouette) {
      silhouetteNotice.classList.remove('hidden');
      resultDescription.replaceChildren(
        strongEl('Note:'),
        document.createTextNode(' ' + String(data.info ?? ''))
      );
    } else if (data.isUpgraded) {
      silhouetteNotice.classList.add('hidden');
      const prefix = String(data.originalResolution || '').charAt(0) || 'p';
      resultDescription.replaceChildren(
        document.createTextNode('🔥 '),
        strongEl('Full HD Upgrade Applied:'),
        document.createTextNode(' Detected preview crop '),
        codeEl(`ctp=${String(data.originalResolution || '***')}`),
        document.createTextNode(' and automatically upgraded to maximum resolution '),
        codeEl(`ctp=${prefix}${String(data.mxResolution ?? '')}`),
        document.createTextNode('.')
      );
    } else {
      silhouetteNotice.classList.add('hidden');
      resultDescription.textContent = data.mxResolution 
        ? `High-resolution photo (${data.mxResolution}) retrieved successfully. Ready to download.`
        : 'Photo retrieved successfully. Ready to download.';
    }

    // Set download link pointing to server proxy
    downloadBtn.href = data.proxyDownloadUrl;
    openLinkBtn.href = data.displayProxyUrl || data.imageUrl;

    resultBox.classList.remove('hidden');
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    if (loading) {
      btnText.textContent = 'Fetching Picture...';
      btnSpinner.classList.remove('hidden');
    } else {
      btnText.textContent = 'Get Profile Picture';
      btnSpinner.classList.add('hidden');
    }
  }

  function showError(msg) {
    errorBox.innerHTML = `
      <div class="error-inner">
        <span class="error-icon">⚠️</span>
        <div class="error-text-content">
          <strong class="error-title">Error Encountered</strong>
          <p class="error-desc">${escapeHtml(msg)}</p>
        </div>
      </div>
    `;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorBox.classList.add('hidden');
    errorBox.innerHTML = '';
  }

  function hideResult() {
    resultBox.classList.add('hidden');
  }

  function updateInputGuidance(value) {
    const query = String(value || '').trim();
    if (!query) {
      inputGuidance.innerHTML = 'Most reliable on cloud hosting: a numeric ID or a <code>profile.php?id=…</code> link.';
      inputGuidance.classList.remove('is-warning');
      return;
    }

    const isNumeric = /^\d+$/.test(query);
    const isNumericProfileUrl = /(?:[?&]id=\d+|\/people\/[^/]+\/\d+)/i.test(query);
    const isShareUrl = /facebook\.com\/share\//i.test(query);
    if (isNumeric || isNumericProfileUrl) {
      inputGuidance.textContent = 'Reliable format detected: the numeric profile ID is included in this input.';
      inputGuidance.classList.remove('is-warning');
    } else if (isShareUrl) {
      inputGuidance.textContent = 'Share links may work, but Facebook can expire or restrict them.';
      inputGuidance.classList.add('is-warning');
    } else {
      inputGuidance.textContent = 'Username detected: Facebook may block username resolution from cloud/datacenter servers. A numeric ID is more reliable.';
      inputGuidance.classList.add('is-warning');
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Safe DOM helpers: build nodes with textContent to avoid injecting HTML.
  function strongEl(text) {
    const el = document.createElement('strong');
    el.textContent = text;
    return el;
  }

  function codeEl(text) {
    const el = document.createElement('code');
    el.textContent = text;
    return el;
  }
});
