# Auth observations and IT contract

Authorized Firefox page is a Bitrix portal with administration, current-user and logout controls. Office Map wrapper uses same-origin POST JSON and implicit browser session credentials. No explicit CSRF field is added by that wrapper. No session/cookie/token values were exported into project evidence. This observation does not establish the complete Bitrix CSRF policy or session lifetime.

No login/logout action, SSO enrollment or identity bypass was performed. SSO redirects, identity-provider issuer and claims are unverified. Require IT discovery/JWKS, issuer/audience, subject-to-employee mapping, approved role and building scope claims, deactivation semantics, test identities, logout/session policy and refresh frequency. Credentials belong in deployment secret storage, never ZIP. Existing local demo authentication is synthetic and not a corporate SSO implementation.
