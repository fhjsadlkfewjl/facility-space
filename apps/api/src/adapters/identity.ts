import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Actor } from '@office/shared';
import { ensure } from '../domain/errors.js';
export interface IdentityAdapter {
  authenticate(header?: string): Promise<Actor>;
}
export function identityFromEnv(): IdentityAdapter {
  if (process.env.AUTH_MODE === 'demo') {
    ensure(
      process.env.NODE_ENV !== 'production',
      500,
      'Demo authentication forbidden in production',
    );
    const demoToken = process.env.DEMO_TOKEN;
    ensure(demoToken && demoToken.length >= 16, 500, 'Set DEMO_TOKEN (at least 16 characters)');
    return {
      async authenticate(header) {
        ensure(header && header.startsWith('Bearer '), 401, 'Authentication required');
        const parts = header.replace(/^Bearer /, '').split(':');
        ensure(parts?.[0] === demoToken, 401, 'Authentication required');
        const role = parts[1] ?? 'employee';
        ensure(['employee', 'facilities', 'admin'].includes(role), 401, 'Invalid demo role');
        return { id: 'demo-' + role, employeeId: process.env.DEMO_EMPLOYEE_ID || 'employee-1', role: role as Actor['role'] };
      },
    };
  }
  const { OIDC_JWKS_URL, OIDC_ISSUER, OIDC_AUDIENCE } = process.env;
  ensure(
    OIDC_JWKS_URL && OIDC_ISSUER && OIDC_AUDIENCE,
    500,
    'Configure approved identity adapter (see docs/sync-strategy.md)',
  );
  ensure(OIDC_JWKS_URL.startsWith('https://'), 500, 'JWKS must use HTTPS');
  const jwks = createRemoteJWKSet(new URL(OIDC_JWKS_URL));
  return {
    async authenticate(header) {
      ensure(header && header.startsWith('Bearer '), 401, 'Authentication required');
      try {
        const { payload } = await jwtVerify(header.slice(7), jwks, {
          issuer: OIDC_ISSUER,
          audience: OIDC_AUDIENCE,
          algorithms: ['RS256', 'ES256'],
          requiredClaims: ['exp', 'iat', 'sub'],
        });
        ensure(
          payload.sub &&
            typeof payload.employee_id === 'string' &&
            ['employee', 'facilities', 'admin'].includes(String(payload.office_role)),
          401,
          'Invalid identity claims',
        );
        return {
          id: payload.sub,
          employeeId: payload.employee_id,
          role: payload.office_role as Actor['role'],
        };
      } catch {
        throw Object.assign(new Error('Invalid access token'), { statusCode: 401 });
      }
    },
  };
}
// Generic approved gateway contract, NOT a claim that Bitrix exposes OIDC or these claims.
