import * as vscode from 'vscode';
import { ProfileManager } from '../profiles/profileManager';
import { SystemDiscovery } from '../discovery/systemDiscovery';
import { GitClient } from '../git/gitClient';
import { AuthenticationType, CreateProfileInput, GitIdentityScope } from '../contracts';
import { Validation } from '../utils/validation';

export function registerProfileCommands(
  context: vscode.ExtensionContext,
  profileManager: ProfileManager,
  systemDiscovery: SystemDiscovery,
  gitClient: GitClient,
  onProfileChanged?: () => void
): void {
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

      let selectedId = targetProfileId;

      if (!selectedId) {
        const active = await profileManager.getActiveProfile();
        const items = profiles.map(p => ({
          label: `${p.id === active?.id ? '$(check) ' : ''}${p.name}`,
          description: `${p.git.name} <${p.git.email}>`,
          detail: `GitHub: ${p.github?.username || 'None'} · Auth: ${p.authentication.type} · Scope: ${p.git.scope}`,
          profileId: p.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a Git/GitHub Profile',
        });
        if (!selected) return;
        selectedId = selected.profileId;
      }

      const confirmGlobalGitChange = async (): Promise<boolean> => {
        const continueBtn = 'Continue';
        const choice = await vscode.window.showWarningMessage(
          "You're about to change your global Git identity.",
          { modal: true, detail: "This affects repositories that don't override their local Git identity." },
          continueBtn
        );
        return choice === continueBtn;
      };

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await profileManager.switchProfile(selectedId, workspaceFolder, confirmGlobalGitChange);

      // Ask to associate with current workspace if open
      if (workspaceFolder) {
        const currentAssoc = await profileManager.getAssociation(workspaceFolder);
        if (currentAssoc !== selectedId) {
          const profile = await profileManager.getProfile(selectedId);
          const assocAction = `Remember for this folder`;
          vscode.window.showInformationMessage(
            `Switched to profile "${profile?.name}". Remember this profile for this repository?`,
            assocAction
          ).then(action => {
            if (action === assocAction) {
              profileManager.associateRepository(workspaceFolder, selectedId!);
            }
          });
        }
      }

      vscode.window.showInformationMessage(`Active profile switched.`);
      onProfileChanged?.();
    })
  );

  // 2. Create Profile
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createProfile', async () => {
      // Step 1: Name
      const name = await vscode.window.showInputBox({
        title: 'Create Profile (1/6)',
        prompt: 'Enter a profile name (e.g. work, personal, opensource)',
        validateInput: val => {
          if (!Validation.isValidProfileName(val)) {
            return 'Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars)';
          }
          return undefined;
        },
      });
      if (!name) return;

      // Step 2: Git Name
      const gitName = await vscode.window.showInputBox({
        title: 'Create Profile (2/6)',
        prompt: 'Enter Git commit author name (e.g. John Doe)',
        validateInput: val => (val.trim().length > 0 ? undefined : 'Git name cannot be empty'),
      });
      if (!gitName) return;

      // Step 3: Git Email
      const gitEmail = await vscode.window.showInputBox({
        title: 'Create Profile (3/6)',
        prompt: 'Enter Git commit email (e.g. john@company.com)',
        validateInput: val => (Validation.isValidEmail(val) ? undefined : 'Please enter a valid email address'),
      });
      if (!gitEmail) return;

      // Step 4: Identity Scope
      const scopeSelection = await vscode.window.showQuickPick(
        [
          { label: 'Repository (Recommended)', description: 'Applies identity locally to the opened repository', scope: 'local' as GitIdentityScope },
          { label: 'Global', description: 'Sets global Git identity (will prompt before overwriting)', scope: 'global' as GitIdentityScope },
        ],
        { title: 'Create Profile (4/6): Identity Scope' }
      );
      if (!scopeSelection) return;

      if (scopeSelection.scope === 'global') {
        const continueBtn = 'Continue';
        const choice = await vscode.window.showWarningMessage(
          "You're about to change your global Git identity.",
          { modal: true, detail: "This affects repositories that don't override their local Git identity." },
          continueBtn
        );
        if (choice !== continueBtn) return;
      }

      // Step 5: GitHub Username & Host
      const githubUsername = await vscode.window.showInputBox({
        title: 'Create Profile (5/6)',
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
        title: 'Create Profile (6/6): Authentication Method',
      });
      if (!authSelection) return;

      let patToken: string | undefined;
      if (authSelection.type === 'pat') {
        patToken = await vscode.window.showInputBox({
          title: 'GitHub Personal Access Token',
          prompt: 'Enter Personal Access Token (stored encrypted in VS Code Secrets)',
          password: true,
          validateInput: val => (val.trim().length > 0 ? undefined : 'Token cannot be empty'),
        });
        if (!patToken) return;
      }

      const input: CreateProfileInput = {
        name: name.trim(),
        git: {
          name: gitName.trim(),
          email: gitEmail.trim(),
          scope: scopeSelection.scope,
        },
        github: githubUsername ? { host: githubHost, username: githubUsername.trim() } : undefined,
        authentication: {
          type: authSelection.type,
          source: authSelection.type === 'pat' ? 'vs-code-secret-storage' : 'user-input',
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
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        await profileManager.switchProfile(selected.profileId, workspaceFolder);
        vscode.window.showInformationMessage(`Switched active profile to "${selected.label}".`);
        onProfileChanged?.();
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
          await profileManager.updateProfile(selected.profileId, {
            git: { name: newGitName.trim(), email: newGitEmail.trim() },
          });
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
}
