# Taigi Web Deployment Docs

This directory documents the Taigi Voice Video Web deployment plan.

Recommended production split:

- `https://taigi.yihua.app` - public frontend app
- `https://xn--kpr858j.yihua.app` - optional public frontend alias or redirect
- `https://static-taigi.yihua.app` - R2 static snapshots and media files
- `https://api-taigi.yihua.app` - FastAPI backend

Start with:

- [Static CDN and Backend Split](./static-cdn-backend-split.md)
- [Deployment Checklist](./deployment-checklist.md)

## Should This Become A Separate Repo?

Not yet. Keeping `taigi_web/docs` inside this repo is better while the deployment
shape is still changing with the code, because the docs reference local paths,
environment variables, HAProxy rules, and frontend build behavior in this same
tree.

It is reasonable to split this directory into an independent repo later when:

- the frontend, backend, and infra are deployed by separate workflows;
- non-code operators need the docs without cloning VoxCPM;
- the docs include secrets-free runbooks, diagrams, and public operations policy;
- deployment automation lives outside this repository.

If this is split later, keep a short `taigi_web/docs/README.md` here that links
to the external repo and records which app version the docs apply to.
