import { ConfirmationRequirement, Operation, OperationSafety } from '../contracts';

export class OperationSafetyChecker {
  public static assessSafety(operation: Operation): {
    safety: OperationSafety;
    confirmation: ConfirmationRequirement;
  } {
    const type = operation.type;
    const input = operation.input as any;

    // Destructive operations:
    // 1. Force push
    if (type === 'git.push' && input.force) {
      return {
        safety: 'destructive',
        confirmation: {
          required: true,
          reason: 'Force push can overwrite remote history.',
          warning: 'Remote commits may be permanently lost.',
        },
      };
    }

    // 2. Reset hard
    if (type === 'git.reset' && input.mode === 'hard') {
      return {
        safety: 'destructive',
        confirmation: {
          required: true,
          reason: `git reset --hard ${input.ref}`,
          warning: 'All uncommitted changes will be permanently discarded.',
        },
      };
    }

    // 3. Force branch delete
    if (type === 'git.branch.delete' && input.force) {
      return {
        safety: 'destructive',
        confirmation: {
          required: true,
          reason: `Force delete branch "${input.name}"`,
          warning: 'Unmerged commits on this branch will be lost.',
        },
      };
    }

    // 4. Stash drop
    if (type === 'git.stash.drop') {
      return {
        safety: 'destructive',
        confirmation: {
          required: true,
          reason: `Drop stash ${input.stash || 'stash@{0}'}`,
          warning: 'The stashed changes cannot be recovered.',
        },
      };
    }

    // 5. Delete remote GitHub repository
    if (type === 'github.repository.delete') {
      return {
        safety: 'destructive',
        confirmation: {
          required: true,
          reason: `Permanently delete GitHub repository "${input.owner}/${input.repository}"`,
          warning: 'This action is irreversible.',
        },
      };
    }

    // 6. Git Rebase (Section 11)
    if (type === 'git.rebase') {
      return {
        safety: 'mutating',
        confirmation: {
          required: true,
          reason: `Rebase current branch onto "${input.onto || 'upstream'}"`,
          warning: 'Rebasing rewrites commit history on the current branch.',
        },
      };
    }

    // 7. Git Tag Delete (Section 11)
    if (type === 'git.tag.delete') {
      return {
        safety: 'mutating',
        confirmation: {
          required: true,
          reason: `Delete tag "${input.name}"`,
          warning: 'The tag reference will be permanently removed.',
        },
      };
    }

    // 8. Git Remote Remove (Section 11)
    if (type === 'git.remote.remove') {
      return {
        safety: 'mutating',
        confirmation: {
          required: true,
          reason: `Remove remote "${input.name}"`,
          warning: 'Remote configuration and remote-tracking branches will be deleted.',
        },
      };
    }

    // 9. GitHub Pull Request Merge (Section 11)
    if (type === 'github.pull-request.merge') {
      return {
        safety: 'mutating',
        confirmation: {
          required: true,
          reason: `Merge Pull Request #${input.number}`,
          warning: `This will merge PR #${input.number} into the target branch.`,
        },
      };
    }

    // 10. GitHub Issue Close (Section 11)
    if (type === 'github.issue.close') {
      return {
        safety: 'mutating',
        confirmation: {
          required: true,
          reason: `Close GitHub Issue #${input.number}`,
          warning: `This will close issue #${input.number}.`,
        },
      };
    }

    // Read-only operations:
    const readOnlyTypes: string[] = [
      'git.status',
      'git.diff',
      'git.log',
      'git.blame',
      'github.account.get',
      'github.repository.get',
      'github.repository.list',
      'github.issue.list',
      'github.pull-request.list',
      'github.actions.list',
      'github.release.list',
    ];

    if (readOnlyTypes.includes(type)) {
      return {
        safety: 'read-only',
        confirmation: { required: false },
      };
    }

    // Mutating operations:
    return {
      safety: 'mutating',
      confirmation: { required: false },
    };
  }
}
