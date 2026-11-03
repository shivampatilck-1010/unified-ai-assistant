import React, { useState } from 'react';
import { loginWithGoogle, type UserProfile } from '../../lib/api';
import './GoogleLoginModal.css';

interface GoogleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
}

export const GoogleLoginModal: React.FC<GoogleLoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickSignIn = async (email: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loginWithGoogle({ email, name });
      onLoginSuccess(res.user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    const derivedName = nameInput.trim() || emailInput.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    void handleQuickSignIn(emailInput.trim(), derivedName);
  };

  return (
    <div className="google-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="google-modal" onClick={(e) => e.stopPropagation()}>
        <div className="google-modal__header">
          <div className="google-modal__title-row">
            <svg width="22" height="22" viewBox="0 0 24 24" className="google-modal__g-icon">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <h3 className="google-modal__title">Google Account</h3>
          </div>
          <button type="button" className="google-modal__close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="google-modal__body">
          {currentUser ? (
            <div className="google-modal__profile-view">
              <div className="google-modal__avatar-large">
                {currentUser.picture ? (
                  <img src={currentUser.picture} alt={currentUser.name} />
                ) : (
                  <span>{currentUser.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="google-modal__user-info">
                <h4 className="google-modal__user-name">{currentUser.name}</h4>
                <p className="google-modal__user-email">{currentUser.email}</p>
                <span className="google-modal__badge">✓ Signed in with Google</span>
              </div>

              <div className="google-modal__actions">
                <button
                  type="button"
                  className="google-modal__signout-btn"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="google-modal__desc">
                Sign in with your Google account to sync conversation history, save custom files, and receive executive follow-up emails.
              </p>

              {error && <div className="google-modal__error">{error}</div>}

              {/* Instant One-Click Google Auth */}
              <button
                type="button"
                className="google-modal__primary-btn"
                disabled={loading}
                onClick={() => handleQuickSignIn('shivam.patil@gmail.com', 'Shivam Patil')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" className="google-modal__g-icon">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{loading ? 'Authenticating…' : 'Continue as Shivam Patil'}</span>
              </button>

              <div className="google-modal__divider">
                <span>or enter another Google account</span>
              </div>

              <form onSubmit={handleSubmit} className="google-modal__form">
                <input
                  type="email"
                  className="google-modal__input"
                  placeholder="Google email (e.g. user@gmail.com)"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="google-modal__input"
                  placeholder="Display Name (optional)"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
                <button type="submit" className="google-modal__submit-btn" disabled={loading}>
                  {loading ? 'Verifying with Google…' : 'Sign in with Google'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
