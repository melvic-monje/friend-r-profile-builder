=== friend_r Profile Builder ===
Contributors: vcfyit
Tags: nostalgia, profile, retro, friendster, builder
Requires at least: 5.5
Tested up to: 6.5
Requires PHP: 7.2
Stable tag: 1.0.1
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

= 1.0.1 =
* First public release on GitHub.
* Hooks the GitHub-Releases-based auto-updater so future versions appear in WP admin → Plugins → Updates.

= 1.0.0 =
* Initial private build.

== Credits ==

Built by [VCFY I.T. Solutions](https://vcfyit.com). Inspired by the early-2000s social web. Glitterfy and YouTube embeds via their respective public services.
