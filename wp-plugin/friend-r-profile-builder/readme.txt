=== friend_r Profile Builder ===
Contributors: vcfyit
Tags: nostalgia, profile, retro, friendster, builder
Requires at least: 5.5
Tested up to: 6.5
Requires PHP: 7.2
Stable tag: 1.0.6
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A drop-in nostalgia profile builder. Visitors build a retro profile, share a screenshot or a link, and your brand sits in the corner of every share.

== Description ==

friend_r Profile Builder lets visitors of your WordPress site build a retro early-2000s profile and share it as either a screenshot (for Instagram/TikTok) or a self-contained URL (for Twitter/Facebook/WhatsApp). All profile data lives in the URL hash &mdash; no database, no signup, no backend.

**Features**

* Three-column retro profile layout with photo, bio, music, friends, glitter banner
* Photo + background image upload with client-side compression (no server storage needed)
* YouTube music embed that autoplays after the visitor clicks "Enter Profile"
* Custom theme colors and full background image customization
* Glitter / sparkle banner embed (Glitterfy-compatible) with HTML sanitization
* Screenshot share via html2canvas (Web Share API on mobile, download fallback on desktop)
* Personalized intro modal: WP-logged-in visitors get a thank-you message; everyone else gets the intro/marketing pitch

**Usage**

1. Install and activate the plugin.
2. Create a new WordPress page (e.g. "Build Your Profile").
3. Add a `[friend_r_builder]` shortcode.
4. Publish. Done.

**Disclaimer**

This is a fan-made recreation for entertainment only. Not affiliated with, endorsed by, or sponsored by the Friendster brand. Friendster&reg; and related marks are property of their respective owners.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/friend-r-profile-builder/` (or install via the WordPress plugins screen as a zip).
2. Activate through the 'Plugins' menu in WordPress.
3. Drop `[friend_r_builder]` into any page or post.

== Frequently Asked Questions ==

= Does this need a database? =

No. Profile data is encoded into the URL hash (`#p=...`), so each "shared profile" is just a URL pointing back to the same builder page.

= Will this run on shared WordPress hosting? =

Yes. There's no PHP backend logic beyond rendering the shortcode and serving CSS/JS. No database queries, no email sending, no external APIs from the server side.

= How big can the share URL get? =

Roughly 100&ndash;150KB if the profile has both a photo and a background image (both base64-encoded). All major browsers and social platforms handle URLs this long. Twitter/X uses t.co shortening so the visible link stays small.

= Can I customize the intro modal text? =

Yes. Edit `templates/builder.php` and look for the `<div id="intro-modal">` block. The plugin shows different text to logged-in WP users vs. logged-out visitors.

== Changelog ==

= 1.0.6 =
* Fix: email gate not showing for logged-out visitors. wp_localize_script casts integers to strings, so the JS check `if (CFG.autoLeadId)` was treating `"0"` as truthy and saving a junk lead with id 0, which then suppressed the gate. Now coerces to a real int + cleans up any stale junk leads in localStorage.

= 1.0.5 =
* Adds a "Saving… / Saved" status pill in the builder header so visitors can see autosave is happening (every keystroke saves to localStorage).
* Preview button now requires a username (same as Share). Without one, the field gets focused + an inline error is shown instead of silently producing a long fallback URL.
* Preview now uses the proper save flow — the address bar updates to the short personalized URL `?p=username_xxxx` instead of the long base64 hash.

= 1.0.4 =
* Skip the email gate for logged-in WP users — their email is already known. The plugin auto-creates / reuses a lead row tied to their WP account email so admins testing the builder don't have to re-enter their email and the leads table stays accurate.

= 1.0.3 =
* Adds a "Check for updates" link to the plugin row on Plugins → Installed Plugins. Click clears the GitHub cache and forces an immediate update check.

= 1.0.2 =
* Email gate on builder entry (splash modal) — visitors enter email + opt-in before building
* Personalized share URLs: `yoursite.com/build/?p=<username>_<rand4>` — random 4-char suffix is auto-appended so usernames never collide
* New WP DB table `wp_frpb_profiles` storing leads + their profile state (text only — photos go to Cloudinary)
* Admin → friend_r → Leads: searchable table with stats, filter by opt-in, CSV export, per-row delete
* Cloudinary integration: photo + bg image uploads go to your Cloudinary account (set `FRPB_CLOUDINARY_CLOUD_NAME` + `FRPB_CLOUDINARY_UPLOAD_PRESET` in the main plugin file)
* 5 MB max file size on uploads, with friendly error messages
* Friendlier WP-logged-in greeting (uses first name → nickname → user_login → strips email format if it slips through)
* REST endpoints `frpb/v1/lead`, `frpb/v1/save-profile`, `frpb/v1/profile/{username}` — all nonce-validated + IP rate-limited (5/hr)

= 1.0.1 =
* First public release on GitHub.
* Hooks the GitHub-Releases-based auto-updater so future versions appear in WP admin → Plugins → Updates.

= 1.0.0 =
* Initial private build.

== Credits ==

Built by [VCFY I.T. Solutions](https://vcfyit.com). Inspired by the early-2000s social web. Glitterfy and YouTube embeds via their respective public services.
