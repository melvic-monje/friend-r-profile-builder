<?php
/**
 * Builder body — included by the [friend_r_builder] shortcode.
 *
 * IMPORTANT: this is included inside the WordPress page's <body>, so it must NOT
 * contain <html>, <head>, or <body> tags. Just the markup that goes inside .frpb-shell.
 *
 * The HTML below is the same structure as the standalone static/index.html,
 * minus the page-level chrome.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
?>
<div class="builder-shell" data-frpb-root>

  <header class="builder-header">
    <div class="builder-title">
      <span class="logo-mini"></span>
      <div>
        <h1>friend_r Profile Builder</h1>
        <p class="builder-subtitle">A fan-made nostalgia tribute &middot; Not affiliated with Friendster&reg;</p>
      </div>
    </div>
    <div class="builder-actions">
      <button id="reset-btn" class="btn btn-ghost" type="button">Reset</button>
      <button id="view-mode-btn" class="btn" type="button">Preview &raquo;</button>
      <button id="share-btn" class="btn btn-primary" type="button">&#128247; Share Screenshot</button>
    </div>
  </header>

  <div class="builder-layout">

    <aside class="builder-form" id="form-panel">
      <form id="profile-form" autocomplete="off">

        <fieldset>
          <legend>Photo &amp; Identity</legend>
          <label>Profile Photo
            <input type="file" name="photo_file" accept="image/*" data-photo>
            <span class="hint">Auto-resized to 400px, ~30KB</span>
          </label>
          <label>Display Name
            <input type="text" name="full_name" maxlength="60" placeholder="Ezra Tanaka">
          </label>
          <label>Tagline
            <input type="text" name="tagline" maxlength="120" placeholder="A short quote that describes you">
          </label>
          <label>Shoutout
            <input type="text" name="shoutout" maxlength="120" placeholder="What's on your mind right now?">
            <span class="hint">Like a status update &mdash; short and snappy. Shows in the &ldquo;Shoutout&rdquo; box.</span>
          </label>
          <label>Username <span class="required-mark">*</span>
            <input type="text" name="username" maxlength="32" placeholder="e.g. melvic" autocomplete="off">
            <span class="hint" id="username-hint">Your share link will be: <code id="username-preview">your-page/?p=username</code></span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Basics</legend>
          <div class="row">
            <label>Gender
              <select name="gender">
                <option value="">--</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </label>
            <label>Age
              <input type="number" name="age" min="13" max="120" placeholder="26">
            </label>
          </div>
          <label>Location
            <input type="text" name="location" placeholder="Manila, Philippines">
          </label>
          <label>Occupation
            <input type="text" name="occupation" placeholder="Designer">
          </label>
          <label>Relationship Status
            <select name="relationship_status">
              <option value="">--</option>
              <option>Single</option>
              <option>In a relationship</option>
              <option>Married</option>
              <option>It's complicated</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>About You</legend>
          <label>About Me
            <textarea name="about_me" rows="4" placeholder="Tell people about yourself..."></textarea>
          </label>
          <label>Who I'd Like to Meet
            <textarea name="who_id_like_to_meet" rows="2"></textarea>
          </label>
          <label>Interests
            <textarea name="interests" rows="2" placeholder="photography, coffee, late-night drives..."></textarea>
          </label>
          <label>Favorite Music
            <textarea name="favorite_music" rows="2"></textarea>
          </label>
          <label>Favorite Movies
            <textarea name="favorite_movies" rows="2"></textarea>
          </label>
          <label>Favorite Books
            <textarea name="favorite_books" rows="2"></textarea>
          </label>
        </fieldset>

        <fieldset>
          <legend>Profile Music</legend>
          <label>Music URL
            <input type="url" name="music_url" placeholder="https://youtube.com/watch?v=...">
            <span class="hint">YouTube autoplays once visitor clicks &ldquo;Enter Profile&rdquo;. Spotify embeds without autoplay.</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Glitter / Sparkle Embed</legend>
          <label>Embed HTML
            <textarea name="glitter_html" rows="4" placeholder='Paste glitter embed code, e.g. from glitterfy.com'></textarea>
            <span class="hint">Allowed: &lt;a&gt;, &lt;img&gt;, &lt;font&gt;, &lt;marquee&gt;, &lt;br&gt;. Scripts and unsafe attributes are stripped.</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Customize Theme</legend>
          <label>Background Image
            <input type="file" name="bg_file" accept="image/*" data-bg>
            <span class="hint">Auto-resized to 1200px, ~80KB</span>
          </label>
          <div class="color-grid">
            <label>Background<input type="color" name="theme_bg_color" value="#0a0617"></label>
            <label>Box<input type="color" name="theme_box_color" value="#1a1430"></label>
            <label>Text<input type="color" name="theme_text_color" value="#e8e2ff"></label>
            <label>Heading<input type="color" name="theme_heading_color" value="#ffcc66"></label>
            <label>Link<input type="color" name="theme_link_color" value="#ffb24a"></label>
          </div>
        </fieldset>

      </form>
    </aside>

    <main class="builder-preview" id="preview-panel">
      <div class="preview-pane" id="preview-pane">
        <div class="preview-frame" id="preview-frame">
          <!-- Profile DOM gets rendered here by app.js -->
        </div>
      </div>
    </main>

  </div>

</div>

<div id="toast" class="toast" hidden></div>

<div id="share-modal" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-card">
    <button class="modal-close" data-close type="button" aria-label="Close">&times;</button>
    <h2>Share your profile</h2>
    <p class="muted">Two ways to flex it.</p>

    <div class="share-section">
      <h3>1. Send a link</h3>
      <p class="small">Anyone who opens this URL sees your profile rendered full-screen.</p>
      <div class="share-link-row">
        <input id="share-url" type="text" readonly>
        <button id="copy-link-btn" class="btn btn-primary" type="button">Copy</button>
      </div>
      <div class="share-buttons">
        <a id="share-twitter" target="_blank" rel="noopener" class="btn">&#128081; Tweet</a>
        <a id="share-facebook" target="_blank" rel="noopener" class="btn">&#127759; Facebook</a>
        <a id="share-whatsapp" target="_blank" rel="noopener" class="btn">&#128172; WhatsApp</a>
      </div>
    </div>

    <div class="share-section">
      <h3>2. Post a screenshot</h3>
      <p class="small">For Instagram / Threads / TikTok stories &mdash; image works better than links.</p>
      <button id="download-screenshot-btn" class="btn btn-primary" type="button">&#128247; Download screenshot</button>
      <button id="native-share-btn" class="btn" type="button" hidden>Share image via system&hellip;</button>
    </div>
  </div>
</div>

<a id="edit-mode-btn" href="?" class="floating-edit-btn">&laquo; Edit / Make Your Own</a>

<!-- Email gate splash (shown on first builder visit) -->
<div id="email-gate" class="intro-modal" hidden>
  <div class="intro-modal-card">
    <div class="intro-eyebrow">friend_r &mdash; one quick step</div>
    <h2>Drop your email to start building</h2>
    <p>Welcome. To start customizing your friend_r profile,
       just enter your email below. We'll save your spot and your link.</p>
    <form id="email-gate-form">
      <input type="email" name="email" placeholder="you@example.com" required>
      <label class="optin-label">
        <input type="checkbox" name="opt_in" value="1">
        <span>Send me occasional emails from VCFY about updates and new features.</span>
      </label>
      <button type="submit" class="btn btn-primary intro-enter">
        Start Building &raquo;
      </button>
      <div class="email-gate-error" id="email-gate-error" hidden></div>
    </form>
    <p class="intro-disclaimer">
      We won't share your email. Unsubscribe anytime. Fan-made recreation for entertainment only.
      Not affiliated with Friendster&reg;.
    </p>
  </div>
</div>

<div id="intro-modal" class="intro-modal" hidden>
  <div class="intro-modal-card">
    <?php if ( is_user_logged_in() ) :
      $frpb_current = wp_get_current_user();
      // Prefer first_name → nickname → username — and if it's still email-shaped, take the part before "@"
      $frpb_name = $frpb_current->first_name;
      if ( ! $frpb_name ) {
        $frpb_name = $frpb_current->nickname && $frpb_current->nickname !== $frpb_current->user_login
          ? $frpb_current->nickname : $frpb_current->user_login;
      }
      if ( strpos( $frpb_name, '@' ) !== false ) {
        $frpb_name = substr( $frpb_name, 0, strpos( $frpb_name, '@' ) );
      }
      $frpb_name = $frpb_name ? $frpb_name : 'friend';
      ?>
      <div class="intro-eyebrow">Welcome back</div>
      <h2>Thank you for using this, <?php echo esc_html( $frpb_name ); ?> <span class="wave">&#128075;</span></h2>
      <p>I hope you're doing great in life now. Genuinely.</p>
      <p>The internet got noisier since 2003 &mdash; thanks for taking a minute
         to come back to a quieter version of it.</p>
      <p>If you ever need anything built or fixed, I'm at
         <a href="mailto:info@vcfyit.com">info@vcfyit.com</a>.</p>
      <p class="intro-cta-line">Music will start when you click below.</p>
      <button id="intro-enter-btn" class="btn btn-primary intro-enter" type="button">
        Enter Profile &amp; Play Music &raquo;
      </button>
      <div class="intro-make-yours">
        <a href="?">&raquo; Or make your own profile</a>
      </div>
    <?php else : ?>
      <div class="intro-eyebrow">A note from the maker</div>
      <h2>Hi, I'm Melvic <span class="wave">&#128075;</span></h2>
      <p>I built this friend_r recreation as a love letter to 2003 &mdash; profile songs,
         glittery backgrounds, the whole feeling of taking yourself slightly too seriously
         on the early internet.</p>
      <p>If you want one of these built for you (or anything else), I'm at
         <a href="mailto:info@vcfyit.com">info@vcfyit.com</a>.</p>
      <p class="intro-cta-line">You're about to see a profile someone made.
         Music will start when you click below.</p>
      <button id="intro-enter-btn" class="btn btn-primary intro-enter" type="button">
        Enter Profile &amp; Play Music &raquo;
      </button>
      <div class="intro-make-yours">
        <a href="?">&raquo; Or make your own profile</a>
      </div>
    <?php endif; ?>
    <p class="intro-disclaimer">
      Fan-made recreation for entertainment only. Not affiliated with or endorsed by Friendster&reg;.
      Friendster and related marks belong to their respective owners.
    </p>
  </div>
</div>
