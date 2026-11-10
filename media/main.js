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

  function showProfileForm() {
    const formEl = document.getElementById('profile-form-section');
    if (formEl) {
      formEl.classList.remove('hidden');
      formEl.style.display = 'block';
    }
  }

  function hideProfileForm() {
    const formEl = document.getElementById('profile-form-section');
    if (formEl) {
      formEl.classList.add('hidden');
      formEl.style.display = 'none';
    }
  }

  function updateAuthTypeVisibility() {
    const authType = document.getElementById('form-auth-type')?.value || 'none';
    const patGroup = document.getElementById('form-group-pat');
    const sshGroup = document.getElementById('form-group-ssh');
    if (patGroup) {
      patGroup.style.display = authType === 'pat' ? 'block' : 'none';
    }
    if (sshGroup) {
      sshGroup.style.display = authType === 'ssh' ? 'block' : 'none';
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
    const authType = (document.getElementById('form-auth-type')?.value || 'none').trim();
    const pat = authType === 'pat' ? (document.getElementById('form-pat')?.value || '').trim() : '';
    const sshKeyPath = authType === 'ssh' ? (document.getElementById('form-ssh-key')?.value || '').trim() : '';
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


    if (id) {
      vscode.postMessage({
        command: 'updateProfileFromForm',
        data: { id, name, gitName, gitEmail, githubUsername, host, authType, pat, sshKeyPath, scope },
      });
    } else {
      vscode.postMessage({
        command: 'createProfileFromForm',
        data: { name, gitName, gitEmail, githubUsername, host, authType, pat, sshKeyPath, scope },
      });
    }
  }

  function resetPatAndScope() {
    const patInput = document.getElementById('form-pat');
    if (patInput) {
      patInput.value = '';
      patInput.placeholder = 'ghp_xxxxxxxxxxxx';
    }
    const sshInput = document.getElementById('form-ssh-key');
    if (sshInput) {
      sshInput.value = '';
    }
    const authTypeSelect = document.getElementById('form-auth-type');
    if (authTypeSelect) {
      authTypeSelect.value = 'pat';
    }
    updateAuthTypeVisibility();
    const radio = document.querySelector('input[name="form-scope"][value="local"]');
    if (radio) radio.checked = true;
  }

  function cancelProfileForm() {
    hideFormError();
    hideProfileForm();
    if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
    if (document.getElementById('form-name')) document.getElementById('form-name').value = '';
    if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = '';
    if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = '';
    if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = '';
    if (document.getElementById('form-host')) document.getElementById('form-host').value = 'github.com';
    resetPatAndScope();
    const patStatus = document.getElementById('pat-verify-status');
    if (patStatus) {
      patStatus.innerHTML = '';
    }
    const sshStatus = document.getElementById('ssh-verify-status');
    if (sshStatus) {
      sshStatus.innerHTML = 'Leave blank to use default SSH agent/keys.';
    }
    if (document.getElementById('form-title')) document.getElementById('form-title').innerText = 'CREATE / EDIT PROFILE';
    const submitBtn = document.getElementById('form-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Save Profile';
    }
  }

  function editProfile(id) {
    hideFormError();
    const profiles = getProfilesData();
    const p = profiles.find(item => item.id === id);
    if (!p) return;

    showProfileForm();
    if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = p.id;
    if (document.getElementById('form-name')) document.getElementById('form-name').value = p.name;
    if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = p.git.name;
    if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = p.git.email;
    if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = p.github?.username || '';
    if (document.getElementById('form-host')) document.getElementById('form-host').value = p.github?.host || 'github.com';
    if (document.getElementById('form-pat')) {
      const patInput = document.getElementById('form-pat');
      patInput.value = '';
      if (p.authentication?.type === 'pat') {
        patInput.placeholder = '(Token saved - leave blank to keep unchanged)';
      } else {
        patInput.placeholder = 'ghp_xxxxxxxxxxxx';
      }
    }
    if (document.getElementById('form-ssh-key')) {
      document.getElementById('form-ssh-key').value = p.authentication?.sshKeyPath || '';
    }
    if (document.getElementById('form-auth-type')) {
      const aType = p.authentication?.type || 'none';
      document.getElementById('form-auth-type').value = (aType === 'ssh' || aType === 'pat') ? aType : 'none';
    }
    updateAuthTypeVisibility();
    const patStatus = document.getElementById('pat-verify-status');
    if (patStatus) {
      patStatus.innerHTML = '';
    }
    const sshStatus = document.getElementById('ssh-verify-status');
    if (sshStatus) {
      sshStatus.innerHTML = 'Leave blank to use default SSH agent/keys.';
    }
    const verifyPatBtn = document.getElementById('btn-verify-pat');
    if (verifyPatBtn) {
      verifyPatBtn.disabled = false;
      verifyPatBtn.innerText = 'Verify & Auto-Fill';
    }
    const verifySshBtn = document.getElementById('btn-verify-ssh');
    if (verifySshBtn) {
      verifySshBtn.disabled = false;
      verifySshBtn.innerText = 'Test & Auto-Fill';
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
    const formEl = document.getElementById('profile-form-section');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
  }

  function fillFormWithAccount(index) {
    hideFormError();
    const discovered = getDiscoveredData();
    const acc = discovered[index];
    if (!acc) return;

    showProfileForm();
    if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
    if (document.getElementById('form-name')) document.getElementById('form-name').value = acc.name || '';
    if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = acc.git?.name || '';
    if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = acc.git?.email || '';
    if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = acc.github?.username || '';
    if (document.getElementById('form-host')) document.getElementById('form-host').value = acc.github?.host || 'github.com';
    resetPatAndScope();
    if (acc.authentication?.type === 'ssh' || acc.authentication?.sshKeyPath) {
      if (document.getElementById('form-auth-type')) document.getElementById('form-auth-type').value = 'ssh';
      if (document.getElementById('form-ssh-key')) document.getElementById('form-ssh-key').value = acc.authentication?.sshKeyPath || '';
    } else if (acc.authentication?.type === 'pat') {
      if (document.getElementById('form-auth-type')) document.getElementById('form-auth-type').value = 'pat';
    } else if (acc.authentication?.type === 'none' || !acc.authentication?.type) {
      if (document.getElementById('form-auth-type')) document.getElementById('form-auth-type').value = 'none';
    }
    updateAuthTypeVisibility();

    if (document.getElementById('form-title')) {
      document.getElementById('form-title').innerText = 'IMPORT PROFILE: ' + (acc.name || 'Account');
    }
    if (document.getElementById('form-submit-btn')) {
      document.getElementById('form-submit-btn').innerText = 'Save Profile';
    }
    const formEl = document.getElementById('profile-form-section');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
  }

  function startNewProfile() {
    cancelProfileForm();
    showProfileForm();
    if (document.getElementById('form-auth-type')) {
      document.getElementById('form-auth-type').value = 'pat';
      updateAuthTypeVisibility();
    }
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

  function verifyPatTokenAction() {
    const patInput = document.getElementById('form-pat');
    const hostInput = document.getElementById('form-host');
    const pat = (patInput ? patInput.value : '').trim();
    const host = (hostInput ? hostInput.value : '').trim() || 'github.com';
    const statusEl = document.getElementById('pat-verify-status');
    const btn = document.getElementById('btn-verify-pat');

    if (!pat) {
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-unverified">Please paste or enter a PAT first.</span>';
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Verifying...';
    }
    if (statusEl) {
      statusEl.innerHTML = '<span class="hint-text">Verifying token with GitHub...</span>';
    }

    vscode.postMessage({
      command: 'verifyToken',
      token: pat,
      host: host,
    });
  }

  function verifySshKeyAction() {
    const keyInput = document.getElementById('form-ssh-key');
    const hostInput = document.getElementById('form-host');
    const sshKeyPath = (keyInput ? keyInput.value : '').trim();
    const host = (hostInput ? hostInput.value : '').trim() || 'github.com';
    const statusEl = document.getElementById('ssh-verify-status');
    const btn = document.getElementById('btn-verify-ssh');

    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Testing...';
    }
    if (statusEl) {
      statusEl.innerHTML = '<span class="hint-text">Testing SSH authentication...</span>';
    }

    vscode.postMessage({
      command: 'testSshKey',
      sshKeyPath: sshKeyPath,
      host: host,
    });
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
      case 'dismissDiscovered':
        vscode.postMessage({ command: 'dismissDiscovered' });
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
      case 'importAllDiscoveredAccounts': {
        vscode.postMessage({ command: 'importAllDiscoveredAccounts' });
        break;
      }
      case 'togglePat':
        togglePatVisibility();
        break;
      case 'verifyPatToken':
        verifyPatTokenAction();
        break;
      case 'verifySshKey':
        verifySshKeyAction();
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

  // Delegated change handler for authentication type selection
  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'form-auth-type') {
      updateAuthTypeVisibility();
    }
  });

  // Initial auth type visibility setup
  updateAuthTypeVisibility();

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
    } else if (msg.command === 'verificationStatuses') {
      const statuses = msg.statuses || {};
      for (const [profId, stat] of Object.entries(statuses)) {
        const el = document.getElementById('profile-name-' + profId);
        if (el) {
          el.classList.remove('status-verified', 'status-unverified', 'status-neutral');
          const isVerified = stat.status === 'verified' || (!stat.status && stat.verified);
          const isNeutral = stat.status === 'not-verified';
          if (isVerified) {
            el.classList.add('status-verified');
            el.title = 'Verified: ' + (stat.message || '');
          } else if (isNeutral) {
            el.classList.add('status-neutral');
            el.title = stat.message || 'Configured, not verified';
          } else {
            el.classList.add('status-unverified');
            el.title = 'Verification warning: ' + (stat.message || '');
          }
        }
      }
      const activeTitle = document.querySelector('.card-active-identity .profile-title-name');
      if (activeTitle && msg.activeProfileId && statuses[msg.activeProfileId]) {
        const stat = statuses[msg.activeProfileId];
        activeTitle.classList.remove('status-verified', 'status-unverified', 'status-neutral');
        const isVerified = stat.status === 'verified' || (!stat.status && stat.verified);
        const isNeutral = stat.status === 'not-verified';
        if (isVerified) {
          activeTitle.classList.add('status-verified');
          activeTitle.title = 'Verified: ' + (stat.message || '');
        } else if (isNeutral) {
          activeTitle.classList.add('status-neutral');
          activeTitle.title = stat.message || 'Configured, not verified';
        } else {
          activeTitle.classList.add('status-unverified');
          activeTitle.title = 'Verification warning: ' + (stat.message || '');
        }
      }
    } else if (msg.command === 'verificationResult') {
      const resBox = document.getElementById('verify-result-' + msg.profileId);
      if (resBox && msg.result) {
        resBox.classList.remove('hidden');
        resBox.textContent = '';

        var badge = document.createElement('div');
        badge.className = msg.result.success ? 'badge badge-success' : 'badge badge-danger';
        badge.textContent = msg.result.message || (msg.result.success ? 'Verified' : 'Verification failed');
        resBox.appendChild(badge);

        if (msg.result.success) {
          if (msg.result.scopes && msg.result.scopes.length > 0) {
            var sc = document.createElement('div');
            sc.className = 'sub';
            sc.style.marginTop = '2px';
            sc.style.fontSize = '10px';
            sc.textContent = 'Scopes: ' + msg.result.scopes.join(', ');
            resBox.appendChild(sc);
          }
          if (msg.result.expiration) {
            var exp = document.createElement('div');
            exp.className = 'sub';
            exp.style.marginTop = '2px';
            exp.style.fontSize = '10px';
            exp.textContent = 'Expires: ' + msg.result.expiration;
            resBox.appendChild(exp);
          }
        }
      }
    } else if (msg.command === 'verifyTokenResult') {
      const statusEl = document.getElementById('pat-verify-status');
      const verifyBtn = document.getElementById('btn-verify-pat');
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.innerText = 'Verify & Auto-Fill';
      }
      if (msg.success) {
        if (msg.login) {
          const ghUser = document.getElementById('form-gh-user');
          if (ghUser) ghUser.value = msg.login;
          const formName = document.getElementById('form-name');
          if (formName && (!formName.value || formName.value.trim() === '')) {
            formName.value = msg.login;
          }
        }
        if (msg.name || msg.login) {
          const gitName = document.getElementById('form-git-name');
          const isGenericName = gitName && (!gitName.value || /^(user|git\s*user|github\s*user|work\s*user|default)$/i.test(gitName.value.trim()));
          if (gitName && isGenericName) {
            gitName.value = msg.name || msg.login;
          }
        }
        if (msg.email) {
          const gitEmail = document.getElementById('form-git-email');
          const isGenericEmail = gitEmail && (!gitEmail.value || /^(user@example\.com|work@company\.com)$/i.test(gitEmail.value.trim()));
          if (gitEmail && isGenericEmail) {
            gitEmail.value = msg.email;
          }
        }
        if (statusEl) {
          const missingRepo = msg.scopes && msg.scopes.length > 0 && !msg.scopes.includes('repo');
          if (missingRepo) {
            statusEl.innerHTML = '<span class="status-unverified">Verified @' + (msg.login || 'user') + ' (Warning: missing repo scope)</span>';
          } else {
            statusEl.innerHTML = '<span class="status-verified">Verified @' + (msg.login || 'user') + '</span>';
          }
        }
      } else {
        if (statusEl) {
          statusEl.innerHTML = '<span class="status-unverified">' + (msg.message || 'Verification failed') + '</span>';
        }
      }
    } else if (msg.command === 'testSshResult') {
      const statusEl = document.getElementById('ssh-verify-status');
      const verifyBtn = document.getElementById('btn-verify-ssh');
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.innerText = 'Test & Auto-Fill';
      }
      if (msg.success) {
        if (msg.login) {
          const ghUser = document.getElementById('form-gh-user');
          if (ghUser) ghUser.value = msg.login;
          const formName = document.getElementById('form-name');
          if (formName && (!formName.value || formName.value.trim() === '')) {
            formName.value = msg.login;
          }
          const gitEmail = document.getElementById('form-git-email');
          const isGenericEmail = gitEmail && (!gitEmail.value || /^(user@example\.com|work@company\.com)$/i.test(gitEmail.value.trim()));
          if (gitEmail && isGenericEmail) {
            gitEmail.value = msg.email || (msg.login + '@users.noreply.github.com');
          }
          const gitName = document.getElementById('form-git-name');
          const isGenericName = gitName && (!gitName.value || /^(user|git\s*user|github\s*user|work\s*user|default)$/i.test(gitName.value.trim()));
          if (gitName && isGenericName) {
            gitName.value = msg.login;
          }
        }
        if (statusEl) {
          statusEl.innerHTML = '<span class="status-verified">' + (msg.message || ('Authenticated as @' + msg.login)) + '</span>';
        }
      } else {
        if (statusEl) {
          statusEl.innerHTML = '<span class="status-unverified">' + (msg.message || 'SSH test failed') + '</span>';
        }
      }
    } else if (msg.command === 'profileDeleted') {
      const currentId = document.getElementById('form-profile-id')?.value;
      if (currentId === msg.profileId) {
        cancelProfileForm();
      }
    }
  });

})();
