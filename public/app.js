document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('fetch-form');
  const input = document.getElementById('fb-input');
  const sizeSelect = document.getElementById('size-select');
  const customTokenInput = document.getElementById('custom-token');
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

  let currentImageUrl = '';

  // Ensure clean state on load
  hideError();
  hideResult();

  // Clear errors when user types
  input.addEventListener('input', () => {
    hideError();
  });

  // Quick sample chips
  document.querySelectorAll('.sample-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.sample;
      input.focus();
      hideError();
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
          size: sizeSelect.value,
          customToken: customTokenInput.value.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to retrieve Facebook profile picture.');
      }

      displayResult(data);
    } catch (err) {
      console.error(err);
      showError(err.message || 'An unexpected error occurred while fetching the profile picture.');
    } finally {
      setLoading(false);
    }
  });

  // Copy direct link
  copyLinkBtn.addEventListener('click', async () => {
    if (!currentImageUrl) return;
    try {
      await navigator.clipboard.writeText(currentImageUrl);
      showToast('Image link copied to clipboard!');
    } catch (err) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = currentImageUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Image link copied!');
    }
  });

  function displayResult(data) {
    currentImageUrl = data.imageUrl;
    avatarImg.onerror = () => {
      if (currentImageUrl && !resultBox.classList.contains('hidden')) {
        hideResult();
        showError('The profile picture could not be loaded from Facebook servers. The image link may have expired or access was blocked.');
      }
    };
    avatarImg.src = data.imageUrl;

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
      resultDescription.innerHTML = `<strong>Note:</strong> ${data.info}`;
    } else if (data.isUpgraded) {
      silhouetteNotice.classList.add('hidden');
      resultDescription.innerHTML = `🔥 <strong>Full HD Upgrade Applied:</strong> Detected preview crop <code>ctp=${data.originalResolution || '***'}</code> and automatically upgraded to maximum resolution <code>ctp=${data.originalResolution?.charAt(0) || 'p'}${data.mxResolution}</code>.`;
    } else {
      silhouetteNotice.classList.add('hidden');
      resultDescription.textContent = data.mxResolution 
        ? `High-resolution photo (${data.mxResolution}) retrieved successfully. Ready to download.`
        : 'Photo retrieved successfully. Ready to download.';
    }

    // Set download link pointing to server proxy
    downloadBtn.href = data.proxyDownloadUrl;
    openLinkBtn.href = data.imageUrl;

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
});
