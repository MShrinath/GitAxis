(function () {
  const vscode = acquireVsCodeApi();

  function getProfilesData() {
    try {
      const el = document.getElementById('gitaxis-profiles');
      return el ? JSON.parse(el.textContent || '[]') : [];
    } catch (e) {
      return [];
    }
  }

  function getDiscoveredData() {
    try {
      const el = document.getElementById('gitaxis-discovered');
      return el ? JSON.parse(el.textContent || '[]') : [];
    } catch (e) {
      return [];
    }
  }

  function showFormError(msg) {
    const errEl = document.getElementById('form-error-msg');
    if (errEl) {
      errEl.innerText = msg;
      errEl.classList.remove('hidden');
      errEl.style.display = 'block';
    }
  }

  function hideFormError() {
    const errEl = document.getElementById('form-error-msg');
    if (errEl) {
      errEl.classList.add('hidden');
      errEl.style.display = 'none';
    }
  }

  function saveCurrentFormToState() {
    try {
      const currentState = vscode.getState() || {};
      const scopeEl = document.querySelector('input[name="form-scope"]:checked');
      const formState = {
        id: document.getElementById('form-profile-id')?.value || '',
        name: document.getElementById('form-name')?.value || '',
        gitName: document.getElementById('form-git-name')?.value || '',
        gitEmail: document.getElementById('form-git-email')?.value || '',
        githubUsername: document.getElementById('form-gh-user')?.value || '',
        host: document.getElementById('form-host')?.value || 'github.com',
        orgs: document.getElementById('form-orgs')?.value || '',
        pat: document.getElementById('form-pat')?.value || '',
        scope: scopeEl ? scopeEl.value : 'local',
        title: document.getElementById('form-title')?.innerText || 'CREATE / EDIT PROFILE',
        submitBtnText: document.getElementById('form-submit-btn')?.innerText || 'Save Profile',
      };
      vscode.setState({ ...currentState, form: formState });
    } catch (e) {
      console.error('Failed to save form state:', e);
    }
  }

  function restoreFormFromState() {
    try {
      const state = vscode.getState();
      if (!state || !state.form) return;
      const f = state.form;
      if (f.name || f.gitName || f.gitEmail || f.githubUsername || f.pat || f.id) {
        if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = f.id || '';
        if (document.getElementById('form-name')) document.getElementById('form-name').value = f.name || '';
        if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = f.gitName || '';
        if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = f.gitEmail || '';
        if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = f.githubUsername || '';
        if (document.getElementById('form-host')) document.getElementById('form-host').value = f.host || 'github.com';
        if (document.getElementById('form-orgs')) document.getElementById('form-orgs').value = f.orgs || '';
        if (document.getElementById('form-pat')) document.getElementById('form-pat').value = f.pat || '';
        if (f.scope) {
          const radio = document.querySelector('input[name="form-scope"][value="' + f.scope + '"]');
          if (radio) radio.checked = true;
        }
        if (f.title && document.getElementById('form-title')) {
          document.getElementById('form-title').innerText = f.title;
        }
        if (f.submitBtnText && document.getElementById('form-submit-btn')) {
          document.getElementById('form-submit-btn').innerText = f.submitBtnText;
        }
      }
    } catch (e) {
      console.error('Failed to restore form state:', e);
    }
  }

  function saveProfileForm() {
    hideFormError();
    const id = (document.getElementById('form-profile-id')?.value || '').trim();
    const name = (document.getElementById('form-name')?.value || '').trim();
    const gitName = (document.getElementById('form-git-name')?.value || '').trim();
    const gitEmail = (document.getElementById('form-git-email')?.value || '').trim();
    const githubUsername = (document.getElementById('form-gh-user')?.value || '').trim();
    const host = (document.getElementById('form-host')?.value || '').trim() || 'github.com';
    const orgs = (document.getElementById('form-orgs')?.value || '').trim();
    const pat = (document.getElementById('form-pat')?.value || '').trim();
    const scopeEl = document.querySelector('input[name="form-scope"]:checked');
    const scope = scopeEl ? scopeEl.value : 'local';

    if (!name) {
      showFormError('Profile Name is required.');
      return;
    }
    if (!gitName) {
      showFormError('Git Author Name is required.');
      return;
    }
    if (!gitEmail || !gitEmail.includes('@')) {
      showFormError('A valid Git Email is required.');
      return;
    }

    const submitBtn = document.getElementById('form-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Saving...';
    }

    saveCurrentFormToState();

    if (id) {
      vscode.postMessage({
        command: 'updateProfileFromForm',
        data: { id, name, gitName, gitEmail, githubUsername, host, orgs, pat, scope },
      });
    } else {
      vscode.postMessage({
        command: 'createProfileFromForm',
        data: { name, gitName, gitEmail, githubUsername, host, orgs, pat, scope },
      });
    }
  }

  function cancelProfileForm() {
    hideFormError();
    if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
    if (document.getElementById('form-name')) document.getElementById('form-name').value = '';
    if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = '';
    if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = '';
    if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = '';
    if (document.getElementById('form-host')) document.getElementById('form-host').value = 'github.com';
    if (document.getElementById('form-orgs')) document.getElementById('form-orgs').value = '';
    if (document.getElementById('form-pat')) {
      const patInput = document.getElementById('form-pat');
      patInput.value = '';
      patInput.placeholder = 'ghp_xxxxxxxxxxxx';
    }
    const radio = document.querySelector('input[name="form-scope"][value="local"]');
    if (radio) radio.checked = true;
    if (document.getElementById('form-title')) document.getElementById('form-title').innerText = 'CREATE / EDIT PROFILE';
    const submitBtn = document.getElementById('form-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Save Profile';
    }
    const currentState = vscode.getState() || {};
    vscode.setState({ ...currentState, form: null });
  }

  function editProfile(id) {
    hideFormError();
    const profiles = getProfilesData();
    const p = profiles.find(item => item.id === id);
    if (!p) return;

    if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = p.id;
    if (document.getElementById('form-name')) document.getElementById('form-name').value = p.name;
    if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = p.git.name;
    if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = p.git.email;
    if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = p.github?.username || '';
    if (document.getElementById('form-host')) document.getElementById('form-host').value = p.github?.host || 'github.com';
    if (document.getElementById('form-orgs')) document.getElementById('form-orgs').value = (p.github?.orgs || []).join(', ');
    if (document.getElementById('form-pat')) {
      const patInput = document.getElementById('form-pat');
      patInput.value = '';
      if (p.authentication?.type === 'pat') {
        patInput.placeholder = '(Token saved - leave blank to keep unchanged)';
      } else {
        patInput.placeholder = 'ghp_xxxxxxxxxxxx';
      }
    }
    const scopeVal = p.git.scope || 'local';
    const radio = document.querySelector('input[name="form-scope"][value="' + scopeVal + '"]');
    if (radio) radio.checked = true;

    if (document.getElementById('form-title')) {
      document.getElementById('form-title').innerText = 'EDIT PROFILE: ' + p.name;
    }
    if (document.getElementById('form-submit-btn')) {
      document.getElementById('form-submit-btn').innerText = 'Update Profile';
    }
    saveCurrentFormToState();
    const formEl = document.getElementById('profile-form-section');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
  }

  function fillFormWithAccount(index) {
    hideFormError();
    const discovered = getDiscoveredData();
    const acc = discovered[index];
    if (!acc) return;

    if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
    if (document.getElementById('form-name')) document.getElementById('form-name').value = acc.name || '';
    if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = acc.git?.name || '';
    if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = acc.git?.email || '';
    if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = acc.github?.username || '';
    if (document.getElementById('form-host')) document.getElementById('form-host').value = acc.github?.host || 'github.com';
    if (document.getElementById('form-pat')) {
      const patInput = document.getElementById('form-pat');
      patInput.value = '';
      patInput.placeholder = 'ghp_xxxxxxxxxxxx';
    }
    const radio = document.querySelector('input[name="form-scope"][value="local"]');
    if (radio) radio.checked = true;

    if (document.getElementById('form-title')) {
      document.getElementById('form-title').innerText = 'IMPORT PROFILE: ' + (acc.name || 'Account');
    }
    if (document.getElementById('form-submit-btn')) {
      document.getElementById('form-submit-btn').innerText = 'Save Profile';
    }
    saveCurrentFormToState();
    const formEl = document.getElementById('profile-form-section');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
  }

  function startNewProfile() {
    cancelProfileForm();
    const formEl = document.getElementById('profile-form-section');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    const nameInput = document.getElementById('form-name');
    if (nameInput) nameInput.focus();
  }

  function togglePatVisibility() {
    const input = document.getElementById('form-pat');
    const btn = document.getElementById('btn-toggle-pat');
    if (!input || !btn) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerText = 'Hide';
    } else {
      input.type = 'password';
      btn.innerText = 'Show';
    }
  }

  // Delegated click handler
  document.addEventListener('click', function (event) {
    const target = event.target ? event.target.closest('[data-action]') : null;
    if (!target) return;

    const action = target.getAttribute('data-action');
    switch (action) {
      case 'refresh':
        vscode.postMessage({ command: 'refresh' });
        break;
      case 'scanAccounts':
        vscode.postMessage({ command: 'scanAccounts' });
        break;
      case 'startNewProfile':
        startNewProfile();
        break;
      case 'switchProfile': {
        const profileId = target.getAttribute('data-profile-id');
        if (profileId) {
          vscode.postMessage({ command: 'switchProfile', profileId });
        }
        break;
      }
      case 'verifyProfile': {
        const profileId = target.getAttribute('data-profile-id');
        if (profileId) {
          const resBox = document.getElementById('verify-result-' + profileId);
          if (resBox) {
            resBox.innerHTML = '<span class="hint-text">Verifying account credentials...</span>';
            resBox.classList.remove('hidden');
          }
          vscode.postMessage({ command: 'verifyProfile', profileId });
        }
        break;
      }
      case 'editProfile': {
        const profileId = target.getAttribute('data-profile-id');
        if (profileId) {
          editProfile(profileId);
        }
        break;
      }
      case 'deleteProfile': {
        const profileId = target.getAttribute('data-profile-id');
        const profiles = getProfilesData();
        const p = profiles.find(item => item.id === profileId);
        if (profileId) {
          vscode.postMessage({ command: 'deleteProfile', profileId, name: p?.name || '' });
        }
        break;
      }
      case 'fillForm': {
        const idx = parseInt(target.getAttribute('data-index') || '-1', 10);
        if (idx >= 0) {
          fillFormWithAccount(idx);
        }
        break;
      }
      case 'importDiscoveredAccount': {
        const idx = parseInt(target.getAttribute('data-index') || '-1', 10);
        if (idx >= 0) {
          vscode.postMessage({ command: 'importDiscoveredAccount', index: idx });
        }
        break;
      }
      case 'togglePat':
        togglePatVisibility();
        break;
      case 'saveProfileForm':
        saveProfileForm();
        break;
      case 'cancelProfileForm':
        cancelProfileForm();
        break;
      case 'openRepo': {
        const url = target.getAttribute('data-url');
        if (url) {
          vscode.postMessage({ command: 'openInBrowser', url });
        } else {
          vscode.postMessage({ command: 'openGitHubRepo' });
        }
        break;
      }
      case 'useRecommended':
        vscode.postMessage({ command: 'useRecommended' });
        break;
    }
  });

  // Attach input listeners for persistent caching
  ['form-name', 'form-git-name', 'form-git-email', 'form-gh-user', 'form-host', 'form-orgs', 'form-pat'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', saveCurrentFormToState);
    }
  });

  document.querySelectorAll('input[name="form-scope"]').forEach(function (el) {
    el.addEventListener('change', saveCurrentFormToState);
  });

  // Backend response listeners
  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (!msg) return;
    if (msg.command === 'saveSuccess') {
      cancelProfileForm();
    } else if (msg.command === 'saveError') {
      const submitBtn = document.getElementById('form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        const id = document.getElementById('form-profile-id')?.value;
        submitBtn.innerText = id ? 'Update Profile' : 'Save Profile';
      }
      showFormError(msg.error || 'Failed to save profile.');
    } else if (msg.command === 'verificationResult') {
      const resBox = document.getElementById('verify-result-' + msg.profileId);
      if (resBox && msg.result) {
        resBox.classList.remove('hidden');
        if (msg.result.success) {
          var detail = '<div class="badge badge-success">✓ ' + (msg.result.message || 'Verified') + '</div>';
          if (msg.result.scopes && msg.result.scopes.length > 0) {
            detail += '<div class="sub" style="margin-top:2px; font-size:10px;">Scopes: ' + msg.result.scopes.join(', ') + '</div>';
          }
          if (msg.result.expiration) {
            detail += '<div class="sub" style="margin-top:2px; font-size:10px;">Expires: ' + msg.result.expiration + '</div>';
          }
          resBox.innerHTML = detail;
        } else {
          resBox.innerHTML = '<div class="badge badge-danger">✗ ' + (msg.result.message || 'Verification failed') + '</div>';
        }
      }
    } else if (msg.command === 'profileDeleted') {
      const currentId = document.getElementById('form-profile-id')?.value;
      if (currentId === msg.profileId) {
        cancelProfileForm();
      }
    }
  });

  // Restore on initial render
  restoreFormFromState();
})();
