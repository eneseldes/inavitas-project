const CSRF_COOKIE_NAME = 'csrf_token';

/** `csrf_token` çerezini okur (httpOnly değil, double-submit deseni için JS okumalı). */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
