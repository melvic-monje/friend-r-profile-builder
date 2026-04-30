# friend_r Profile Builder

A drop-in nostalgia profile builder. Visitors build a retro early-2000s profile, share it as a screenshot or a self-contained URL, and your brand sits in the corner of every share.

> Fan-made recreation for entertainment only. Not affiliated with, endorsed by, or sponsored by the Friendster brand. Friendster® and related marks are property of their respective owners.

## What's in this repo

```
.
├── static/                         ← source-of-truth: the standalone builder
│   ├── index.html                  ← form + preview shell
│   ├── style.css                   ← Friendster-era CSS (unscoped)
│   └── app.js                      ← state, render, share, YouTube, sanitizer
│
├── wp-plugin/
│   ├── scope-css.js                ← build step: scopes static/style.css for WP
│   ├── friend-r-profile-builder/   ← the actual WordPress plugin
│   │   ├── friend-r-profile-builder.php
│   │   ├── readme.txt
│   │   ├── templates/builder.php
│   │   └── assets/                 ← (auto-synced from static/)
│   └── friend-r-profile-builder.zip ← (generated on release; gitignored)
│
└── .github/workflows/release.yml   ← auto-builds + publishes zip on tag push
```

## How the share flow works

- All profile data is encoded in the URL hash (`#p=base64...`). No backend, no database.
- Visiting a share URL → the builder switches to view-mode (no form, full-screen profile).
- A modal greets the visitor with a configurable intro message; clicking the button dismisses the modal AND unmutes the YouTube iframe (the click is the user gesture browsers require for audio playback).
- Sharing offers two options: copy URL, or download a screenshot (html2canvas).

## Development

The static version is the source of truth. Edit `static/*` and test locally:

```bash
# Serve the static builder
cd static
python3 -m http.server 8080
# open http://localhost:8080
```

When the static version looks right, run the build step to update the WP plugin's bundled assets:

```bash
make build      # or: node wp-plugin/scope-css.js && cp static/app.js wp-plugin/friend-r-profile-builder/assets/app.js
```

The `scope-css.js` script transforms `static/style.css` into a WordPress-safe version where every selector is prefixed with `.frpb-shell` so the plugin's CSS can't fight with the WP theme.

## Releasing the plugin

Tag-push releases auto-build the `.zip` on GitHub Actions and attach it to a GitHub Release.

```bash
# Update version in:
#   - wp-plugin/friend-r-profile-builder/friend-r-profile-builder.php  (Version: header + FRPB_VERSION constant)
#   - wp-plugin/friend-r-profile-builder/readme.txt                    (Stable tag)
#
# Then:
git tag v1.0.0
git push origin v1.0.0
```

The workflow runs `node wp-plugin/scope-css.js`, copies `static/app.js`, zips the plugin folder, and attaches `friend-r-profile-builder.zip` to the GitHub release. Users install with **Plugins → Add New → Upload Plugin**.

## Auto-update from GitHub Releases

The plugin ships with a built-in GitHub Releases checker so installed users see updates inside the normal **Plugins → Updates** screen — same as plugins from wordpress.org.

**One-time setup before the first release:**

1. Edit [wp-plugin/friend-r-profile-builder/friend-r-profile-builder.php](wp-plugin/friend-r-profile-builder/friend-r-profile-builder.php)
2. Change this line:
   ```php
   define( 'FRPB_GITHUB_REPO', 'YOUR_GITHUB_USERNAME/friend-r-profile-builder' );
   ```
   to your actual `owner/repo` (e.g. `melvicmonje/friend-r-profile-builder`)
3. Commit, build, tag, push — GitHub Actions cuts the release zip
4. Distribute the v1.0.0 zip to early users

**From v1.0.0 onwards**, the plugin polls `https://api.github.com/repos/<owner>/<repo>/releases/latest` (cached 12h) and self-updates from the `.zip` asset attached to each release.

How users experience updates:
- Visit any WP admin page → if a newer version is available, a banner appears in **Plugins → Installed Plugins**
- "View details" shows the release notes (rendered from the GitHub release body Markdown)
- "Update Now" downloads + replaces the plugin in-place

The updater code lives at [wp-plugin/friend-r-profile-builder/includes/github-updater.php](wp-plugin/friend-r-profile-builder/includes/github-updater.php). It only runs in `admin_init` (no public-page load impact) and uses the standard `pre_set_site_transient_update_plugins` hook.

## License

GPL-2.0-or-later. See `LICENSE`.

## Credits

Built by [VCFY I.T. Solutions](https://vcfyit.com).
