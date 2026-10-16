# V25 login security integration

V25 adds frontend states for an MFA code and access from the clinic network. The default remains the existing browser prototype, with demo login and the existing application flows. These screens prepare a backend integration; changing the configuration alone does not secure the application.

V26 retains this contract and both screens. Public registration is closed: new accounts are created by admins under Staff accounts. The backend must enforce admin-only account creation, disable public signup, and preserve existing accounts and legacy pending decisions.

## Preview and prototype

- `index.html?preview=mfa` previews the code screen.
- `index.html?preview=clinic-network` previews the clinic network restriction screen.
- Previews never send a code, contact a delivery provider, or grant access. The prototype demo login remains available through the normal sign-in screen.
- Prototype accounts, permissions, records, and sessions still use browser storage. Do not use this mode for real clinic records.

## Backend adapter contract

Load configuration and the adapter before the login controller:

```js
window.VZ_LOGIN_CONFIG = { mode: 'backend' };
window.VZ_AUTH_ADAPTER = {
  async begin({ username, password }) { /* Authenticate and apply server policy. */ },
  async verify({ challengeId, code }) { /* Verify the server-issued challenge. */ },
  async resend({ challengeId }) { /* Request another email or SMS code. */ },
  async retryNetwork({ retryToken }) { /* Recheck the current network on the server. */ },
  async complete(result) { /* Finish secure session/bootstrap/navigation. */ }
};
```

Omitting backend mode keeps prototype behavior. Each request method resolves to one of the results below; the controller uses the result to select the next screen. `complete(result)` handles a successful `authenticated` result and owns the future secure session, application bootstrap, and navigation. Backend results must never create a `VZ` local prototype session.

| `status` | Fields and meaning |
| --- | --- |
| `mfa_required` | `challengeId`, `channel` (`email`, `sms`, or `authenticator`), `maskedDestination`, `expiresInSeconds`, `resendAfterSeconds`, `canResend`. Display the server-issued challenge without exposing the full destination. |
| `clinic_network_required` | Optional `retryToken`. Explain that staff must connect from the clinic network; a retry asks the server to evaluate access again. |
| `authenticated` | Authentication and the applicable server policy have succeeded. Pass the full result to `complete(result)`. |
| `error` | `code`: `invalid_credentials`, `invalid_code`, `challenge_expired`, `rate_limited`, or `unavailable`; optional `retryAfterSeconds` for retry guidance. |

Email and SMS challenges can offer resend only when `canResend` permits it and the cooldown has elapsed. Authenticator codes come from the enrolled app and have no resend action. Countdown displays are guidance; the server must enforce expiry, resend limits, and attempt limits. A resend response supplies the current challenge state, including any replacement challenge ID or updated timers.

Use a six-digit code. `expiresInSeconds` must be positive and at most 86400; cooldown/retry delays must be nonnegative numbers at most 86400. Challenge and retry IDs are opaque nonempty strings of at most 2048 characters. Without a retry token, **Try again** returns to cleared credentials; it does not retain or replay a password. Resend cannot authenticate a user. Malformed results and adapter failures show an error without falling back to prototype login. Pending challenges exist only in memory; Back or refresh requires a new sign-in attempt.

No MFA channel or delivery provider has been selected. Enrollment, destination verification, recovery, backup codes, lost-device handling, provider integration, and challenge/session storage belong to the backend implementation. Do not replace them with browser-generated codes.

## Required server policy

The server establishes the authenticated role and whether the request comes from a trusted clinic network. Do not accept a role, network flag, hostname, or geolocation assertion from the frontend as proof.

- **Admin outside the clinic:** require MFA before granting access.
- **Admin inside the clinic:** the server may skip MFA under the clinic's policy.
- **Staff outside the clinic:** deny access. Retrying, changing screens, or completing MFA must not bypass this restriction.
- **Staff inside the clinic:** authenticate and enforce staff permissions on the server.

Apply network checks to login and subsequent protected requests, including sensitive operations. Recheck as needed and revoke or reject sessions when a network change makes them ineligible. Enforce server-side credential and challenge rate limits, challenge expiration, one-time code use, and secure session lifecycle controls. Use secure, HttpOnly session cookies and appropriate CSRF protection; never trust a browser-stored user ID as an authenticated session.

## Work required before production

Replace browser authentication, all protected-page guards, browser role checks, and the localStorage database with authenticated backend access and shared persistent storage. Every protected API must enforce its own role and clinic network rules. Adding a secure login in front of the current static pages does not protect the records or actions already exposed through `VZ.db` and browser storage.

Verify the complete policy with server integration tests: admin outside requires MFA, staff outside remains denied on every retry, challenges expire and cannot be reused, email/SMS resend observes cooldowns, authenticator has no resend, and network/session changes are enforced after login. Preserve the existing clinic workflows while replacing their data and authorization boundaries.
