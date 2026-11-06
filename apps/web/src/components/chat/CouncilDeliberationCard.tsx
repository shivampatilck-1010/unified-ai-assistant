import React, { useState } from 'react';
import './CouncilDeliberationCard.css';

export interface CouncilParticipant {
  id: string;
  name: string;
  role: string;
  specialty?: string;
  avatarColor?: string;
  provider?: string;
}

export interface CouncilRound {
  speaker: string;
  badge: string;
  avatarColor?: string;
  content: string;
  keyPoints?: string[];
  role?: string;
}

export interface CouncilDeliberationCardProps {
  topic?: string;
  consensusScore?: string;
  participants: CouncilParticipant[];
  rounds: CouncilRound[];
  consensus: string;
  tradeoffs?: Array<{ issue: string; decision: string; agreedBy?: string[] }>;
}

export const CouncilDeliberationCard: React.FC<CouncilDeliberationCardProps> = ({
  topic = 'Multi-Model High-Parameter Council Deliberation',
  consensusScore = '98.5%',
  participants,
  rounds,
  consensus,
  tradeoffs = [],
}) => {
  const [activeTab, setActiveTab] = useState<'chamber' | 'consensus' | 'roster'>('chamber');
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>(() => {
    // Expand all rounds by default
    const init: Record<number, boolean> = {};
    rounds.forEach((_, i) => {
      init[i] = true;
    });
    return init;
  });
  const [copiedConsensus, setCopiedConsensus] = useState(false);
  const [selectedSpeakerFilter, setSelectedSpeakerFilter] = useState<string | null>(null);

  const toggleRound = (idx: number) => {
    setExpandedRounds((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleCopyConsensus = () => {
    void navigator.clipboard.writeText(consensus);
    setCopiedConsensus(true);
    setTimeout(() => setCopiedConsensus(false), 2000);
  };

  const filteredRounds = selectedSpeakerFilter
    ? rounds.filter((r) => r.speaker.toLowerCase().includes(selectedSpeakerFilter.toLowerCase()))
    : rounds;

  return (
    <div className="council-card" role="region" aria-label="AI Council Deliberation">
      {/* Council Header */}
      <div className="council-card__header">
        <div className="council-card__title-row">
          <div className="council-card__badge-group">
            <span className="council-card__badge council-card__badge--chamber">
              <span className="council-card__dot-live" aria-hidden="true" />
              AI Council In Session
            </span>
            <span className="council-card__badge council-card__badge--score">
              Consensus: {consensusScore}
            </span>
          </div>
          <span className="council-card__mode-tag">Roundtable Deliberation</span>
        </div>

        <h3 className="council-card__topic">{topic}</h3>

        {/* Participant Avatars Roster */}
        <div className="council-card__roster-chips">
          <span className="council-card__roster-label">Deliberating Models:</span>
          {participants.map((p) => {
            const isSelected = selectedSpeakerFilter === p.name;
            return (
              <button
                key={p.id}
                type="button"
                className={`council-card__chip ${isSelected ? 'council-card__chip--active' : ''}`}
                onClick={() =>
                  setSelectedSpeakerFilter(isSelected ? null : p.name)
                }
                title={`Filter discussion by ${p.name} (${p.role})`}
              >
                <span
                  className="council-card__chip-dot"
                  style={{ backgroundColor: p.avatarColor || '#d97757' }}
                  aria-hidden="true"
                />
                <span className="council-card__chip-name">{p.name}</span>
                <span className="council-card__chip-role">{p.role.split('&')[0]}</span>
              </button>
            );
          })}
          {selectedSpeakerFilter && (
            <button
              type="button"
              className="council-card__chip-reset"
              onClick={() => setSelectedSpeakerFilter(null)}
            >
              Show All
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="council-card__tabs">
        <button
          type="button"
          className={`council-card__tab ${activeTab === 'chamber' ? 'council-card__tab--active' : ''}`}
          onClick={() => setActiveTab('chamber')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Meeting Discussion ({rounds.length} Turns)</span>
        </button>

        <button
          type="button"
          className={`council-card__tab ${activeTab === 'consensus' ? 'council-card__tab--active' : ''}`}
          onClick={() => setActiveTab('consensus')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Unified Consensus Deliverable</span>
        </button>

        <button
          type="button"
          className={`council-card__tab ${activeTab === 'roster' ? 'council-card__tab--active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Council Roles & Alignment</span>
        </button>
      </div>

      {/* Tab 1: Chamber (Sequential Speech Turns & Debate) */}
      {activeTab === 'chamber' && (
        <div className="council-card__chamber">
          <div className="council-card__timeline-thread">
            {filteredRounds.map((round, idx) => {
              const isExpanded = expandedRounds[idx] ?? true;
              const participant = participants.find(
                (p) => p.name.toLowerCase() === round.speaker.toLowerCase()
              );
              const color = round.avatarColor || participant?.avatarColor || '#d97757';

              return (
                <div key={idx} className="council-card__speech-bubble">
                  <div className="council-card__speech-header" onClick={() => toggleRound(idx)}>
                    <div className="council-card__speaker-meta">
                      <span
                        className="council-card__speaker-avatar"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      >
                        {round.speaker.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="council-card__speaker-names">
                        <span className="council-card__speaker-title">{round.speaker}</span>
                        <span className="council-card__speaker-badge" style={{ borderColor: color, color }}>
                          {round.badge}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="council-card__round-toggle"
                      aria-label={isExpanded ? 'Collapse round' : 'Expand round'}
                    >
                      {isExpanded ? 'Hide ▲' : 'Read ▼'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="council-card__speech-body">
                      <p className="council-card__speech-text">{round.content}</p>

                      {round.keyPoints && round.keyPoints.length > 0 && (
                        <div className="council-card__key-points">
                          <span className="council-card__key-points-title">Core Contribution:</span>
                          <ul>
                            {round.keyPoints.map((pt, pIdx) => (
                              <li key={pIdx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick link to consensus at bottom of chamber */}
          <div className="council-card__chamber-footer">
            <button
              type="button"
              className="council-card__view-consensus-btn"
              onClick={() => setActiveTab('consensus')}
            >
              <span>View Synthesized Consensus Resolution</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Unified Consensus (Final Deliverable) */}
      {activeTab === 'consensus' && (
        <div className="council-card__consensus">
          <div className="council-card__consensus-toolbar">
            <div className="council-card__consensus-status">
              <span className="council-card__consensus-check" aria-hidden="true">✓</span>
              <span>Unanimous Council Alignment Verified</span>
            </div>
            <button
              type="button"
              className="council-card__copy-btn"
              onClick={handleCopyConsensus}
            >
              {copiedConsensus ? '✓ Copied Consensus' : 'Copy Consensus'}
            </button>
          </div>

          <div className="council-card__consensus-body">
            <p className="council-card__consensus-text">{consensus}</p>
          </div>

          {tradeoffs.length > 0 && (
            <div className="council-card__tradeoffs">
              <h4 className="council-card__tradeoffs-title">Key Debated Tradeoffs & Resolution:</h4>
              <div className="council-card__tradeoffs-grid">
                {tradeoffs.map((item, i) => (
                  <div key={i} className="council-card__tradeoff-card">
                    <div className="council-card__tradeoff-issue">
                      <strong>Issue:</strong> {item.issue}
                    </div>
                    <div className="council-card__tradeoff-decision">
                      <strong>Resolution:</strong> {item.decision}
                    </div>
                    {item.agreedBy && (
                      <div className="council-card__tradeoff-agreed">
                        <small>Approved by: {item.agreedBy.join(', ')}</small>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Roster (Model Specializations & Architecture) */}
      {activeTab === 'roster' && (
        <div className="council-card__roster">
          <div className="council-card__roster-intro">
            Each participating model is deployed to its maximum strength in this meeting:
          </div>
          <div className="council-card__roster-grid">
            {participants.map((p) => (
              <div key={p.id} className="council-card__profile-card">
                <div className="council-card__profile-header">
                  <span
                    className="council-card__profile-dot"
                    style={{ backgroundColor: p.avatarColor || '#d97757' }}
                  />
                  <div className="council-card__profile-name">{p.name}</div>
                </div>
                <div className="council-card__profile-role">{p.role}</div>
                {p.specialty && (
                  <div className="council-card__profile-specialty">
                    <strong>Domain Power:</strong> {p.specialty}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
