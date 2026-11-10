import * as vscode from 'vscode';
import { ProfileManager } from '../profiles/profileManager';
import { SystemDiscovery } from '../discovery/systemDiscovery';
import { GitClient } from '../git/gitClient';
import { AuthenticationType, CreateProfileInput, GitIdentityScope } from '../contracts';
import { Validation } from '../utils/validation';
import { logger } from '../utils/logger';
import { AccountVerifier } from '../auth/accountVerifier';
import { FolderRuleManager } from '../profiles/folderRuleManager';
import { confirmGlobalGitChange, getWorkspaceRepoPath } from '../utils/workspace';

async function confirmAndApplyFolderRules(
  folderRuleManager: FolderRuleManager,
  profileManager: ProfileManager,
  promptPrefix: string,
  successMsg: string
): Promise<void> {
  const allProfiles = await profileManager.getProfiles();
  const preview = await folderRuleManager.previewIncludeIfChanges(allProfiles);
  const confirmBtn = 'Confirm & Apply';
  const confirm = await vscode.window.showInformationMessage(
    `${promptPrefix}\n\n${preview.includeIfBlock || '(No active folder rules)'}`,
    { modal: true },
    confirmBtn
  );
  if (confirm === confirmBtn) {
    await folderRuleManager.applyIncludeIfRules(allProfiles);
    vscode.window.showInformationMessage(successMsg);
  }
}

export function registerProfileCommands(
  context: vscode.ExtensionContext,
  profileManager: ProfileManager,
  systemDiscovery: SystemDiscovery,
  gitClient: GitClient,
  onProfileChanged?: () => void,
  accountVerifier?: AccountVerifier
): void {
  // Helper: get current repository root
  const getCurrentRepoRoot = async (): Promise<string | undefined> => {
    const folder = getWorkspaceRepoPath();
    if (!folder) return undefined;
    try {
      if (await gitClient.isRepository(folder)) {
        return await gitClient.getRoot(folder);
      }
    } catch {}
    return folder;
  };

  // 1. Switch Profile
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.switchProfile', async (targetProfileId?: string) => {
      const profiles = await profileManager.getProfiles();
      if (profiles.length === 0) {
        const createNow = 'Create Profile';
        const res = await vscode.window.showInformationMessage('No profiles found. Would you like to create one?', createNow);
        if (res === createNow) {
          await vscode.commands.executeCommand('gitaxis.createProfile');
        }
        return;
      }

      const repoRoot = await getCurrentRepoRoot();
      const resolved = repoRoot ? await profileManager.resolveProfileForRepository(repoRoot) : undefined;
      const active = resolved?.profile || (await profileManager.getActiveProfile());

      let selectedId = targetProfileId;

      if (!selectedId) {
        type ProfileQuickPickItem = vscode.QuickPickItem & { profileId?: string; action?: string };
        const items: ProfileQuickPickItem[] = [];

        // Profile items
        items.push({ label: 'Profiles', kind: vscode.QuickPickItemKind.Separator });
        for (const p of profiles) {
          const isCurrent = p.id === active?.id;
          const isFolderMatch = resolved?.source === 'folder-rule' && resolved.profile.id === p.id;
          let badge = '';
          if (isFolderMatch) {
            badge = ` (Folder Rule: ${resolved.folderRule || ''})`;
          }
          const label = `${isCurrent ? '$(check) ' : ''}${p.name}${badge}`;
          const ghTag = p.github?.username ? `@${p.github.username}` : 'no-github';
          items.push({
            label,
            description: `${ghTag} · ${p.git.email}`,
            detail: `${p.git.name} · Auth: ${p.authentication.type} · Scope: ${p.git.scope}${p.folderRules?.length ? ` · Rules: [${p.folderRules.join(', ')}]` : ''}`,
            profileId: p.id,
          });
        }

        // Actions
        items.push({ label: 'Repository Actions', kind: vscode.QuickPickItemKind.Separator });
        items.push({
          label: '$(info) Show Effective Identity',
          description: repoRoot ? 'Inspect effective Git identity and resolution rule for this repo' : 'No repo open',
          action: 'effective-identity',
        });
        items.push({
          label: '$(folder) Configure Folder Rules (includeIf)...',
          description: 'Set up automatic folder-based profiles (~/work/** -> Work)',
          action: 'folder-rules',
        });
        items.push({
          label: '$(settings-gear) Manage Profiles...',
          description: 'Rename, edit identity, or delete profiles',
          action: 'manage',
        });
        items.push({
          label: '$(pass) Verify Account Authentication...',
          description: 'Test credentials with GitHub',
          action: 'verify',
        });
        items.push({
          label: '$(plus) Create New Profile',
          action: 'create',
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: repoRoot ? `Current profile: ${active?.name || 'None'}` : 'Select a Git/GitHub Profile or Action',
        });
        if (!selected) return;

        if (selected.action === 'effective-identity') {
          await vscode.commands.executeCommand('gitaxis.showEffectiveIdentity');
          return;
        } else if (selected.action === 'folder-rules') {
          await vscode.commands.executeCommand('gitaxis.configureFolderRules');
          return;
        } else if (selected.action === 'manage') {
          await vscode.commands.executeCommand('gitaxis.manageProfiles');
          return;
        } else if (selected.action === 'verify') {
          await vscode.commands.executeCommand('gitaxis.verifyAccount');
          return;
        } else if (selected.action === 'create') {
          await vscode.commands.executeCommand('gitaxis.createProfile');
          return;
        }

        selectedId = selected.profileId;
      }

      if (!selectedId) return;

      try {
        const switched = await profileManager.switchProfile(selectedId, repoRoot, confirmGlobalGitChange);
        vscode.window.showInformationMessage(
          repoRoot
            ? `Switched repository to profile "${switched.name}".`
            : `Active profile switched to "${switched.name}".`
        );
        onProfileChanged?.();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('cancelled')) {
          logger.info(`Profile switch was cancelled: ${message}`);
          return;
        }
        vscode.window.showErrorMessage(`Failed to switch profile: ${message}`);
      }
    })
  );

  // 2. Create Profile
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createProfile', async () => {
      const allowGlobalScope = vscode.workspace.getConfiguration('gitaxis').get<boolean>('advanced.allowGlobalScope', false);
      const totalSteps = allowGlobalScope ? 6 : 5;
      let currentStep = 1;

      // Step 1: Name
      const name = await vscode.window.showInputBox({
        title: `Create Profile (${currentStep++}/${totalSteps})`,
        prompt: 'Enter a profile name (e.g. work, personal, opensource)',
        validateInput: val => {
          if (!Validation.isValidProfileName(val)) {
            return 'Please enter a valid profile name (alphanumeric, dash, underscore, dot, space, 1-64 chars)';
          }

          return undefined;
        },
      });
      if (!name) return;

      // Step 2: Git Name
      const gitName = await vscode.window.showInputBox({
        title: `Create Profile (${currentStep++}/${totalSteps})`,
        prompt: 'Enter Git commit author name (e.g. Work User)',
        validateInput: val => (val.trim().length > 0 ? undefined : 'Git name cannot be empty'),
      });
      if (!gitName) return;

      // Step 3: Git Email
      const gitEmail = await vscode.window.showInputBox({
        title: `Create Profile (${currentStep++}/${totalSteps})`,
        prompt: 'Enter Git commit email (e.g. work@company.com)',
        validateInput: val => (Validation.isValidEmail(val) ? undefined : 'Please enter a valid email address'),
      });
      if (!gitEmail) return;

      // Step 4: Identity Scope (Advanced option, hidden by default per Section 7)
      let scope: GitIdentityScope = 'local';
      if (allowGlobalScope) {
        const scopeSelection = await vscode.window.showQuickPick(
          [
            { label: 'Repository (Recommended)', description: 'Applies identity locally to the opened repository', scope: 'local' as GitIdentityScope },
            { label: 'Global', description: 'Sets global Git identity (will prompt before overwriting)', scope: 'global' as GitIdentityScope },
          ],
          { title: `Create Profile (${currentStep++}/${totalSteps}): Identity Scope (Advanced)` }
        );
        if (!scopeSelection) return;
        scope = scopeSelection.scope;

        if (scope === 'global') {
          const continueBtn = 'Continue';
          const choice = await vscode.window.showWarningMessage(
            "You're about to change your global Git identity.",
            { modal: true, detail: "This affects repositories that don't override their local Git identity." },
            continueBtn
          );
          if (choice !== continueBtn) return;
        }
      }

      // Step 5: GitHub Username & Host
      const githubUsername = await vscode.window.showInputBox({
        title: `Create Profile (${currentStep++}/${totalSteps})`,
        prompt: 'Enter GitHub username (optional, press Enter to skip)',
      });

      let githubHost = 'github.com';
      if (githubUsername) {
        const hostInput = await vscode.window.showInputBox({
          title: 'GitHub Host',
          prompt: 'Enter GitHub host (default: github.com)',
          value: 'github.com',
        });
        if (hostInput) githubHost = hostInput.trim();
      }

      // Step 6: Auth Mechanism
      const authOptions: { label: string; detail: string; type: AuthenticationType }[] = [
        { label: 'GitHub CLI', detail: 'Use credentials from gh CLI', type: 'github-cli' },
        { label: 'Git Credential Manager', detail: 'Delegate auth to system credential helper', type: 'credential-manager' },
        { label: 'Personal Access Token (PAT)', detail: 'Securely saved in VS Code SecretStorage', type: 'pat' },
        { label: 'SSH', detail: 'Use existing SSH keys', type: 'ssh' },
        { label: 'None', detail: 'No remote authentication', type: 'none' },
      ];

      const authSelection = await vscode.window.showQuickPick(authOptions, {
        title: `Create Profile (${currentStep++}/${totalSteps}): Authentication Method`,
      });
      if (!authSelection) return;

      let patToken: string | undefined;
      let sshKeyPath: string | undefined;
      if (authSelection.type === 'pat') {
        patToken = await vscode.window.showInputBox({
          title: 'GitHub Personal Access Token',
          prompt: 'Enter Personal Access Token (stored encrypted in VS Code Secrets)',
          password: true,
          validateInput: val => (val.trim().length > 0 ? undefined : 'Token cannot be empty'),
        });
        if (!patToken) return;
      } else if (authSelection.type === 'ssh') {
        sshKeyPath = await vscode.window.showInputBox({
          title: 'SSH Key Path (Optional)',
          prompt: 'Enter path to SSH private key (e.g. ~/.ssh/id_ed25519), or leave empty for default agent/keys',
          validateInput: val => {
            if (!val || val.trim().length === 0) return undefined;
            return Validation.isValidSshKeyPath(val)
              ? undefined
              : 'Invalid SSH key path. Quotes, control characters, or option flags are not allowed.';
          },
        });
        if (sshKeyPath === undefined) return;
      }

      const input: CreateProfileInput = {
        name: name.trim(),
        git: {
          name: gitName.trim(),
          email: gitEmail.trim(),
          scope,
        },
        github: githubUsername ? { host: githubHost, username: githubUsername.trim() } : undefined,
        authentication: {
          type: authSelection.type,
          source: authSelection.type === 'pat' ? 'vs-code-secret-storage' : 'user-input',
          sshKeyPath: sshKeyPath?.trim() || undefined,
        },
      };

      try {
        const created = await profileManager.createProfile(input, patToken);
        vscode.window.showInformationMessage(`Profile "${created.name}" created successfully!`);
        onProfileChanged?.();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create profile: ${String(err)}`);
      }
    })
  );

  // 3. Manage Profiles
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.manageProfiles', async () => {
      const profiles = await profileManager.getProfiles();
      if (profiles.length === 0) {
        vscode.window.showInformationMessage('No profiles to manage. Create one first.');
        return;
      }

      const items = profiles.map(p => ({
        label: p.name,
        description: `${p.git.name} <${p.git.email}>`,
        detail: `ID: ${p.id} · Auth: ${p.authentication.type}`,
        profileId: p.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a profile to manage',
      });
      if (!selected) return;

      const actions = [
        { label: 'Set as Active', action: 'active' },
        { label: 'Rename Profile', action: 'rename' },
        { label: 'Edit Git Identity', action: 'edit' },
        { label: 'Delete Profile', action: 'delete' },
      ];

      const action = await vscode.window.showQuickPick(actions, {
        placeHolder: `Action for profile "${selected.label}"`,
      });
      if (!action) return;

      if (action.action === 'active') {
        await vscode.commands.executeCommand('gitaxis.switchProfile', selected.profileId);
      } else if (action.action === 'rename') {
        const newName = await vscode.window.showInputBox({
          title: 'Rename Profile',
          prompt: 'Enter new profile name',
          value: selected.label,
          validateInput: val => (Validation.isValidProfileName(val) ? undefined : 'Invalid profile name'),
        });
        if (!newName || newName.trim() === selected.label) return;

        try {
          await profileManager.updateProfile(selected.profileId, { name: newName.trim() });
          vscode.window.showInformationMessage(`Profile renamed to "${newName.trim()}".`);
          onProfileChanged?.();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to rename profile: ${String(err)}`);
        }
      } else if (action.action === 'edit') {
        const profile = await profileManager.getProfile(selected.profileId);
        if (!profile) return;

        const newGitName = await vscode.window.showInputBox({
          title: 'Edit Git Name',
          prompt: 'Enter commit author name',
          value: profile.git.name,
        });
        if (!newGitName) return;

        const newGitEmail = await vscode.window.showInputBox({
          title: 'Edit Git Email',
          prompt: 'Enter commit email',
          value: profile.git.email,
          validateInput: val => (Validation.isValidEmail(val) ? undefined : 'Please enter a valid email'),
        });
        if (!newGitEmail) return;

        try {
          const updated = await profileManager.updateProfile(selected.profileId, {
            git: { name: newGitName.trim(), email: newGitEmail.trim() },
          });
          const active = await profileManager.getActiveProfile();
          if (active?.id === selected.profileId) {
            const workspaceFolder = getWorkspaceRepoPath();
            if (workspaceFolder || updated.git.scope === 'global') {
              await profileManager.applyIdentityToRepository(updated, workspaceFolder, confirmGlobalGitChange);
            }
          }
          vscode.window.showInformationMessage(`Profile "${profile.name}" updated.`);
          onProfileChanged?.();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update profile: ${String(err)}`);
        }
      } else if (action.action === 'delete') {
        const confirm = await vscode.window.showWarningMessage(
          `Are you sure you want to delete profile "${selected.label}"?`,
          { modal: true },
          'Delete'
        );
        if (confirm === 'Delete') {
          await profileManager.deleteProfile(selected.profileId);
          vscode.window.showInformationMessage(`Profile "${selected.label}" deleted.`);
          onProfileChanged?.();
        }
      }
    })
  );

  // 4. Scan Accounts
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.scanAccounts', async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'GitAxis: Scanning system Git and GitHub configuration (read-only)...',
        },
        async () => {
          const scanResult = await systemDiscovery.scan();
          const suggestions = systemDiscovery.suggestProfiles(scanResult);

          if (suggestions.length === 0) {
            vscode.window.showInformationMessage('Scan completed. No new accounts detected.');
            return;
          }

          const existingProfiles = await profileManager.getProfiles();
          const newSuggestions = suggestions.filter(
            s => !existingProfiles.some(p => p.name.toLowerCase() === s.name.toLowerCase())
          );

          if (newSuggestions.length === 0) {
            vscode.window.showInformationMessage(
              'Scan completed. Detected accounts already exist in GitAxis profiles.'
            );
            return;
          }

          const items = newSuggestions.map(s => ({
            label: `Import "${s.name}"`,
            description: `${s.git.name} <${s.git.email}>`,
            detail: s.description,
            suggestion: s,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an account to import as a GitAxis profile',
          });

          if (selected) {
            try {
              const created = await profileManager.createProfile(selected.suggestion);
              vscode.window.showInformationMessage(`Profile "${created.name}" imported successfully!`);
              onProfileChanged?.();
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to import profile: ${String(err)}`);
            }
          }
        }
      );
    })
  );


  // 5. Verify Account Authentication
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.verifyAccount', async (targetProfileId?: string) => {
      if (!accountVerifier) {
        vscode.window.showWarningMessage('Account verification service is not initialized.');
        return;
      }

      const profiles = await profileManager.getProfiles();
      if (profiles.length === 0) {
        vscode.window.showWarningMessage('No profiles available to verify.');
        return;
      }

      let selectedId = targetProfileId;
      if (!selectedId) {
        const repoRoot = await getCurrentRepoRoot();
        const resolved = repoRoot ? await profileManager.resolveProfileForRepository(repoRoot) : undefined;
        const active = resolved?.profile || (await profileManager.getActiveProfile());

        const items = profiles.map(p => ({
          label: `${p.id === active?.id ? '$(check) ' : ''}${p.name}`,
          description: `@${p.github?.username || 'none'} <${p.git.email}>`,
          detail: `Auth: ${p.authentication.type}`,
          profileId: p.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select profile to verify with GitHub',
        });
        if (!selected) return;
        selectedId = selected.profileId;
      }

      const profile = await profileManager.getProfile(selectedId);
      if (!profile) return;

      const repoRoot = await getCurrentRepoRoot();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `GitAxis: Verifying profile "${profile.name}"...`,
        },
        async () => {
          const res = await accountVerifier.verifyProfile(profile, repoRoot, { onDemand: true });
          if (res.status === 'verified') {
            let detail = res.message;
            if (res.scopes && res.scopes.length > 0) {
              detail += `\nScopes: ${res.scopes.join(', ')}`;
            }
            if (res.expiration) {
              detail += `\nToken expires: ${res.expiration}`;
            }
            vscode.window.showInformationMessage(`✓ Profile "${profile.name}" verified!\n${detail}`);
          } else if (res.status === 'not-verified') {
            vscode.window.showWarningMessage(`Profile "${profile.name}" is not verified:\n${res.message}`);
          } else {
            vscode.window.showWarningMessage(`✗ Verification failed for "${profile.name}":\n${res.message}`);
          }
        }
      );
    })
  );

  // 6. Show Effective Identity (Section 9 & Section 14)
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.showEffectiveIdentity', async () => {
      const repoRoot = await getCurrentRepoRoot();
      if (!repoRoot) {
        vscode.window.showWarningMessage('No repository workspace open to show effective identity.');
        return;
      }

      const resolved = await profileManager.resolveProfileForRepository(repoRoot);
      const active = resolved?.profile || (await profileManager.getActiveProfile());

      // Fetch git config
      let localName = '';
      let localEmail = '';
      let effectiveEmail = '';
      let effectiveName = '';
      let sshCmd = '';
      let gcmUser = '';
      let remotesList: string[] = [];

      try {
        localName = (await gitClient.getLocalConfig(repoRoot, 'user.name')) || '(not set locally)';
        localEmail = (await gitClient.getLocalConfig(repoRoot, 'user.email')) || '(not set locally)';
        effectiveName = (await gitClient.getConfig(repoRoot, 'user.name')) || '(unset)';
        effectiveEmail = (await gitClient.getConfig(repoRoot, 'user.email')) || '(unset)';
        sshCmd = (await gitClient.getLocalConfig(repoRoot, 'core.sshCommand')) ||
          (await gitClient.getGlobalConfig('core.sshCommand')) || '(default ssh)';
        gcmUser = (await gitClient.getLocalConfig(repoRoot, 'credential.https://github.com.username')) ||
          (await gitClient.getGlobalConfig('credential.https://github.com.username')) || '(not set)';
        const remotes = await gitClient.getRemotes(repoRoot);
        remotesList = remotes.map(r => `${r.name}: ${r.fetchUrl || r.pushUrl || 'none'}`);
      } catch (err) {
        logger.warn(`Could not read full repo git config: ${String(err)}`);
      }

      let ruleExplanation = 'Fallback (Active profile)';
      if (resolved?.source === 'binding') {
        ruleExplanation = 'Repository Profile Override';
      } else if (resolved?.source === 'folder-rule') {
        ruleExplanation = `Folder Rule Pattern ("${resolved.folderRule || 'path match'}")`;
      } else if (resolved?.source === 'matcher') {
        ruleExplanation = `Profile Matcher (Remote host/owner/email)`;
      }

      const report = [
        `### GitAxis Effective Identity for Repository`,
        `**Repository:** \`${repoRoot}\``,
        `**Active Profile:** **${active?.name || 'None'}** (${active?.git.email || 'no email'})`,
        `**Selection Rule:** ${ruleExplanation}`,
        ``,
        `#### Configured in Profile:`,
        `- **Git Author:** ${active?.git.name || 'none'} <${active?.git.email || 'none'}>`,
        `- **GitHub Account:** @${active?.github?.username || 'none'} (${active?.github?.host || 'github.com'})`,
        `- **Auth Method:** ${active?.authentication.type || 'none'}`,
        active?.folderRules?.length ? `- **Folder Rules:** ${active.folderRules.join(', ')}` : '',
        ``,
        `#### Effective Git Config (as seen by Git):`,
        `- **user.name:** ${effectiveName} (Local: ${localName})`,
        `- **user.email:** ${effectiveEmail} (Local: ${localEmail})`,
        `- **core.sshCommand:** \`${sshCmd}\``,
        `- **credential.https://github.com.username:** ${gcmUser}`,
        ``,
        `#### Remotes:`,
        remotesList.length > 0 ? remotesList.map(r => `- ${r}`).join('\n') : '- (no remotes detected)',
      ].filter(Boolean).join('\n');

      const copyBtn = 'Copy Details';
      const switchBtn = 'Switch Profile';
      const choice = await vscode.window.showInformationMessage(
        `Effective Identity: "${active?.name || 'None'}" (${effectiveEmail})\nSelected via: ${ruleExplanation}`,
        { modal: true, detail: report.replace(/### |#### |\*\*/g, '').replace(/`/g, '') },
        copyBtn,
        switchBtn
      );

      if (choice === copyBtn) {
        await vscode.env.clipboard.writeText(report);
        vscode.window.showInformationMessage('Effective identity report copied to clipboard.');
      } else if (choice === switchBtn) {
        await vscode.commands.executeCommand('gitaxis.switchProfile');
      }
    })
  );

  // 7. Configure Folder Rules (Section 7)
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.configureFolderRules', async () => {
      const folderRuleManager = profileManager.getFolderRuleManager();
      const profiles = await profileManager.getProfiles();
      if (profiles.length === 0) {
        vscode.window.showWarningMessage('No profiles found. Please create a profile first.');
        return;
      }

      // Profile selection
      const items = profiles.map(p => ({
        label: p.name,
        description: `@${p.github?.username || 'no-github'} · ${p.git.email}`,
        detail: p.folderRules && p.folderRules.length > 0
          ? `Active Rules: ${p.folderRules.join(', ')}`
          : 'No folder rules configured yet',
        profileId: p.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select profile to configure folder rules for',
      });
      if (!selected) return;

      const profile = await profileManager.getProfile(selected.profileId);
      if (!profile) return;

      const currentRules = profile.folderRules || [];

      // Action selection for this profile
      type RuleAction = vscode.QuickPickItem & { action: string; ruleIndex?: number };
      const actionItems: RuleAction[] = [
        {
          label: '$(plus) Add New Folder Rule...',
          description: 'e.g. ~/work/** or C:/projects/work/**',
          action: 'add',
        },
      ];

      for (let i = 0; i < currentRules.length; i++) {
        actionItems.push({
          label: `$(trash) Remove rule: "${currentRules[i]}"`,
          action: 'remove',
          ruleIndex: i,
        });
      }

      actionItems.push({
        label: '$(cloud-upload) Apply Folder Rules to ~/.gitconfig (includeIf)...',
        description: 'Write GitAxis per-profile include files and update ~/.gitconfig',
        action: 'apply',
      });

      actionItems.push({
        label: '$(clear-all) Remove All GitAxis Config from ~/.gitconfig',
        description: 'Cleanly remove all includeIf rules from ~/.gitconfig',
        action: 'remove-all',
      });

      const chosenAction = await vscode.window.showQuickPick(actionItems, {
        placeHolder: `Folder rules for "${profile.name}" (${currentRules.length} configured)`,
      });
      if (!chosenAction) return;

      if (chosenAction.action === 'add') {
        const repoRoot = await getCurrentRepoRoot();
        const defaultSuggestion = repoRoot ? `${repoRoot}/**` : '~/work/**';

        const newRule = await vscode.window.showInputBox({
          title: `Add Folder Rule for "${profile.name}"`,
          prompt: 'Enter folder path or pattern. Git repositories in this directory will automatically use this profile.',
          value: defaultSuggestion,
          validateInput: val => {
            const trimmed = val ? val.trim() : '';
            if (trimmed.length === 0) {
              return 'Rule cannot be empty';
            }
            if (!Validation.isValidFolderRule(trimmed)) {
              return 'Rule contains invalid characters (quotes, newlines, semicolons, hashes).';
            }
            return undefined;
          },
        });
        if (!newRule) return;

        const updatedRules = [...currentRules, newRule.trim()];
        await profileManager.updateProfile(profile.id, { folderRules: updatedRules });
        vscode.window.showInformationMessage(`Added folder rule "${newRule.trim()}" to profile "${profile.name}".`);

        const applyNow = 'Apply to ~/.gitconfig now';
        const res = await vscode.window.showInformationMessage(
          `Folder rule saved. Would you like to update your global ~/.gitconfig with includeIf rules?`,
          applyNow,
          'Later'
        );
        if (res === applyNow) {
          await confirmAndApplyFolderRules(
            folderRuleManager,
            profileManager,
            'GitAxis will add the following to ~/.gitconfig:',
            'Successfully applied folder rules to ~/.gitconfig!'
          );
        }
        onProfileChanged?.();
      } else if (chosenAction.action === 'remove' && chosenAction.ruleIndex !== undefined) {
        const updatedRules = currentRules.filter((_, idx) => idx !== chosenAction.ruleIndex);
        await profileManager.updateProfile(profile.id, { folderRules: updatedRules });
        vscode.window.showInformationMessage(`Removed folder rule from profile "${profile.name}".`);
        onProfileChanged?.();
      } else if (chosenAction.action === 'apply') {
        await confirmAndApplyFolderRules(
          folderRuleManager,
          profileManager,
          'GitAxis will update ~/.gitconfig with includeIf rules:',
          'Successfully updated ~/.gitconfig with GitAxis folder rules!'
        );
      } else if (chosenAction.action === 'remove-all') {
        await vscode.commands.executeCommand('gitaxis.removeAllConfig');
      }
    })
  );

  // 8. Remove All GitAxis Config (Section 7)
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.removeAllConfig', async () => {
      const folderRuleManager = profileManager.getFolderRuleManager();
      const confirmBtn = 'Remove Config';
      const choice = await vscode.window.showWarningMessage(
        'Are you sure you want to remove all GitAxis includeIf configurations from your global ~/.gitconfig?',
        { modal: true, detail: 'This removes the # GitAxis Start / # GitAxis End block and cleans profile include files.' },
        confirmBtn
      );
      if (choice !== confirmBtn) return;

      const res = await folderRuleManager.removeAllGitAxisConfig();
      if (res.removed) {
        vscode.window.showInformationMessage('Successfully removed all GitAxis configurations from ~/.gitconfig.');
      } else {
        vscode.window.showInformationMessage('No GitAxis configurations were found in ~/.gitconfig.');
      }
      onProfileChanged?.();
    })
  );
}

