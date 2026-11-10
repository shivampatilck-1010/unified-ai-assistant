import React, { useEffect, useRef, useState } from 'react';
import { loginWithGoogle, type UserProfile } from '../../lib/api';
import './GoogleLoginModal.css';

interface GoogleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
}

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityServices {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: {
    theme: 'outline';
    size: 'large';
    shape: 'rectangular';
    width: number;
  }) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityServices } };
  }
}

export const GoogleLoginModal: React.FC<GoogleLoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}) => {
  const buttonContainer = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onLoginSuccessRef = useRef(onLoginSuccess);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    onCloseRef.current = onClose;
    onLoginSuccessRef.current = onLoginSuccess;
  }, [onClose, onLoginSuccess]);

  useEffect(() => {
    if (!isOpen || currentUser || !clientId || !buttonContainer.current) return;

    let active = true;
    const renderGoogleButton = () => {
      if (!active || !buttonContainer.current || !window.google?.accounts.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (!active) return;
          setLoading(true);
          setError(null);
          void loginWithGoogle({ credential: response.credential })
            .then((result) => {
              if (!active) return;
              onLoginSuccessRef.current(result.user);
              onCloseRef.current();
            })
            .catch((err: unknown) => {
              if (active) {
                setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
              }
            })
            .finally(() => {
              if (active) setLoading(false);
            });
        },
      });
      buttonContainer.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonContainer.current, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        width: Math.min(buttonContainer.current.clientWidth || 320, 400),
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (window.google?.accounts.id) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener('load', renderGoogleButton, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = renderGoogleButton;
      script.onerror = () => {
        if (active) setError('Google sign-in could not be loaded. Check your connection and try again.');
      };
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existingScript?.removeEventListener('load', renderGoogleButton);
    };
  }, [clientId, currentUser, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="google-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="google-modal" onClick={(event) => event.stopPropagation()}>
        <div className="google-modal__header">
          <div className="google-modal__title-row">
            <h3 className="google-modal__title">Google Account</h3>
          </div>
          <button type="button" className="google-modal__close-btn" onClick={onClose} aria-label="Close">
            ×
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
                Sign in with a Google account. The server verifies your Google ID token before creating a session.
              </p>
              {error && <div className="google-modal__error" role="alert">{error}</div>}
              {!clientId ? (
                <div className="google-modal__error" role="status">
                  Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID for the web app.
                </div>
              ) : (
                <>
                  <div ref={buttonContainer} className="google-modal__google-button" />
                  {loading && <p className="google-modal__desc" role="status">Verifying Google sign-in…</p>}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
