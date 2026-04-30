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

## Updating an installed plugin

Two options:
- **Manual**: download the new zip from GitHub Releases, deactivate + delete the old plugin in WP admin, upload the new zip, reactivate
- **Plugin Update Checker**: there's a popular library ([YahnisElsts/plugin-update-checker](https://github.com/YahnisElsts/plugin-update-checker)) that lets you point your plugin at a GitHub repo and serve updates through the WP admin's normal update flow. We can wire this in if you want one-click updates.

## License

GPL-2.0-or-later. See `LICENSE`.

## Credits

Built by [VCFY I.T. Solutions](https://vcfyit.com).
