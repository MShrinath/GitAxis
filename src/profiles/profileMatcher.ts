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
        for (const remote of context.remotes) {
          // Check remote host vs profile github host
          if (profile.github?.host && remote.host) {
            if (profile.github.host.toLowerCase() === remote.host.toLowerCase()) {
              score += 20;
              if (!reasons.includes('github-host')) {
                reasons.push('github-host');
              }
            }
          }

          // Check remote owner vs profile github username and allowed orgs
          if (remote.owner) {
            const lowerRemote = remote.owner.toLowerCase();
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
                  const regex = new RegExp('^' + lowerOrg.replace(/\*/g, '.*') + '$');
                  if (regex.test(lowerRemote)) {
                    matchedOwner = true;
                    break;
                  }
                }
              }
            }

            if (matchedOwner) {
              score += 45;
              if (!reasons.includes('remote-owner')) {
                reasons.push('remote-owner');
              }
            }
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
