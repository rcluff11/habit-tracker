---
name: notch-architect
description: "[architect] Notch trust boundaries, threat model and security review checklist (PocketBase rules, hooks, push sender, VM, Netlify)."
user-invocable: false
---
# Notch — Architect security checklist

## Trust boundaries
1. **Browser → PocketBase** (public HTTPS via DuckDNS). Everything the client sends is untrusted. Collection API rules plus `pb_hooks` are the only real authority (principle 5).
2. **Push sender → PocketBase.** The sender logs in as a superuser using credentials in `push/.env` on the VM. That account can read everything, so treat it as the most sensitive secret.
3. **Push sender → push services.** It posts to the `endpoint` URL stored in each `push_subscriptions` record and signs with the private VAPID key.
4. **Netlify → browser.** Static bundle, service worker (`public/sw.js`), and the `VITE_*` vars, which are public by design.

## Must verify on every security review
- [ ] Every collection's **create** rule pins `user = @request.auth.id`, and list, view, update and delete are owner-only. Read the latest migration that sets the rules, not the first one.
- [ ] Every relation is checked for **same-owner** in hooks on create AND update. That covers block→category, task→block, task→step, completion→task, plan_target→plan and →task, course_step→course, and block→step. An id from another user must be rejected.
- [ ] A client cannot set server-owned fields: `completions.points` (the snapshot), `user` on update, or `claimedWeeks` beyond the rules.
- [ ] `users` collection: email visibility, the fields a user can change about themselves, password minimum, auth rate limits. Check that `list`/`view` on `users` doesn't leak other accounts.
- [ ] `push_subscriptions.endpoint` is validated (https only, known push-service hosts). Otherwise the sender can be made to POST to arbitrary URLs from the VM (SSRF).
- [ ] Notification payloads are built from the user's own data only. Check that `sw.js` doesn't render any of it as HTML.
- [ ] No `dangerouslySetInnerHTML` or unescaped `innerHTML` in `src/`.
- [ ] Secrets: `.env`, `.env.local` and `push/.env` are gitignored and absent from git history (`git log --all -- push/.env`). The VAPID private key appears only in `push/.env`.
- [ ] The PocketBase admin UI (`/_/`) is exposed at the public URL. Note whether the superuser password is strong, whether MFA is on, and whether access is restricted.
- [ ] The VM: firewall (only 80/443 open), PocketBase bound to localhost behind the proxy, systemd units not running as root, `push/.env` mode 600, `pb_data` backups.
- [ ] Netlify: security headers (CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`) in `netlify.toml`.
- [ ] Dependencies: `npm audit --omit=dev` is clean, or every finding is triaged.

Rate each finding as **exploitable now**, **defence in depth**, or **hygiene**. Only the first kind is a BLOCK on its own.
