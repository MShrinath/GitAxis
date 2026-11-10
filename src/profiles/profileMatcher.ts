import {
  GitProfile,
  GitRemote,
  ProfileMatch,
  ProfileMatchConfidence,
  ProfileMatchReason,
  ProfileMatchResult,
} from '../contracts';
import { PersistentProfileStore } from './profileStore';

export interface MatchContext {
  repositoryPath?: string;
  remotes?: GitRemote[];
  localGitEmail?: string;
  localGitName?: string;
}

export class ProfileMatcher {
  constructor(private profileStore: PersistentProfileStore) {}

  public async match(context: MatchContext): Promise<ProfileMatchResult> {
    const profiles = await this.profileStore.list();
    if (profiles.length === 0) {
      return {
        matches: [],
        confidence: 'none',
        reasons: ['no-match'],
      };
    }

    // 1. Check explicit repository association first
    if (context.repositoryPath) {
      const associatedId = await this.profileStore.getAssociation(context.repositoryPath);
      if (associatedId) {
        const associatedProfile = profiles.find(p => p.id === associatedId);
        if (associatedProfile) {
          const match: ProfileMatch = {
            profileId: associatedProfile.id,
            score: 100,
            reasons: ['repository-association'],
          };
          return {
            recommendedProfileId: associatedProfile.id,
            matches: [match],
            confidence: 'exact',
            reasons: ['repository-association'],
          };
        }
      }
    }

    const matches: ProfileMatch[] = [];

    for (const profile of profiles) {
      let score = 0;
      const reasons: ProfileMatchReason[] = [];

      // Check remote matches
      if (context.remotes && context.remotes.length > 0) {
        let bestRemoteScore = 0;
        let bestRemoteReasons: ProfileMatchReason[] = [];

        const sortedRemotes = [...context.remotes].sort((a, b) => {
          if (a.name === 'origin') return -1;
          if (b.name === 'origin') return 1;
          return 0;
        });

        for (const remote of sortedRemotes) {
          let currentRemoteScore = 0;
          const currentRemoteReasons: ProfileMatchReason[] = [];

          // Check remote host vs profile github host
          const effectiveHost = remote.pushHost || remote.host;
          if (profile.github?.host && effectiveHost) {
            if (profile.github.host.toLowerCase() === effectiveHost.toLowerCase()) {
              currentRemoteScore += 20;
              currentRemoteReasons.push('github-host');
            }
          }

          // Check remote owner vs profile github username and allowed orgs
          const effectiveOwner = remote.pushOwner || remote.owner;
          if (effectiveOwner) {
            const lowerRemote = effectiveOwner.toLowerCase();
            let matchedOwner = false;
            if (profile.github?.username && profile.github.username.toLowerCase() === lowerRemote) {
              matchedOwner = true;
            }
            if (!matchedOwner && profile.github?.orgs) {
              for (const org of profile.github.orgs) {
                const lowerOrg = org.trim().toLowerCase();
                if (lowerOrg === lowerRemote) {
                  matchedOwner = true;
                  break;
                }
                if (lowerOrg.includes('*')) {
                  const regexPattern = '^' + lowerOrg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
                  const regex = new RegExp(regexPattern);
                  if (regex.test(lowerRemote)) {
                    matchedOwner = true;
                    break;
                  }
                }
              }
            }

            if (matchedOwner) {
              currentRemoteScore += 45;
              currentRemoteReasons.push('remote-owner');
            }
          }

          if (currentRemoteScore > bestRemoteScore) {
            bestRemoteScore = currentRemoteScore;
            bestRemoteReasons = currentRemoteReasons;
          }
        }

        score += bestRemoteScore;
        for (const r of bestRemoteReasons) {
          if (!reasons.includes(r)) {
            reasons.push(r);
          }
        }
      }

      // Check local git config matches
      if (context.localGitEmail && profile.git.email) {
        if (context.localGitEmail.toLowerCase() === profile.git.email.toLowerCase()) {
          score += 25;
          reasons.push('git-email');
        }
      }

      if (context.localGitName && profile.git.name) {
        if (context.localGitName.toLowerCase() === profile.git.name.toLowerCase()) {
          score += 10;
          reasons.push('git-name');
        }
      }

      if (score > 0) {
        matches.push({
          profileId: profile.id,
          score: Math.min(score, 99),
          reasons,
        });
      }
    }

    // Sort matches descending by score
    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return {
        matches: [],
        confidence: 'none',
        reasons: ['no-match'],
      };
    }

    const best = matches[0];
    let confidence: ProfileMatchConfidence = 'low';
    if (best.score >= 65) {
      confidence = 'high';
    } else if (best.score >= 35) {
      confidence = 'medium';
    }

    return {
      recommendedProfileId: best.profileId,
      matches,
      confidence,
      reasons: best.reasons,
    };
  }
}
