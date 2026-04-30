<?php
/**
 * Plugin Name:       friend_r Profile Builder
 * Plugin URI:        https://vcfyit.com
 * Description:       Drop a [friend_r_builder] shortcode into any page to embed a retro profile builder. A fan-made nostalgia tribute by VCFY I.T. Solutions.
 * Version:           1.0.4
 * Requires at least: 5.5
 * Requires PHP:      7.2
 * Author:            VCFY I.T. Solutions
 * Author URI:        https://vcfyit.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       friend-r-profile-builder
 *
 * Disclaimer: Fan-made recreation for entertainment only. Not affiliated with,
 * endorsed by, or sponsored by the Friendster brand. Friendster® and related
 * marks are property of their respective owners.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Block direct access.
}

define( 'FRPB_VERSION', '1.0.4' );
define( 'FRPB_FILE',    __FILE__ );
define( 'FRPB_DIR',     plugin_dir_path( __FILE__ ) );
define( 'FRPB_URL',     plugin_dir_url( __FILE__ ) );

/** Cloudinary config — used by the browser to upload photos directly. */
define( 'FRPB_CLOUDINARY_CLOUD_NAME',  'drzif5she' );
define( 'FRPB_CLOUDINARY_UPLOAD_PRESET', 'vcfyit' );

require_once FRPB_DIR . 'includes/db.php';
require_once FRPB_DIR . 'includes/rest-api.php';
require_once FRPB_DIR . 'includes/admin-leads.php';

register_activation_hook( __FILE__, 'frpb_install_db' );

/**
 * GitHub repo for auto-updates ("owner/repo" — no leading slash, no full URL).
 *
 * 👉 EDIT THIS to match your GitHub repository, then commit + cut a release.
 *    Once installed, the plugin will check this repo's "latest" release on a
 *    12h cache and surface updates inside WP admin → Plugins → Updates.
 */
define( 'FRPB_GITHUB_REPO', 'melvic-monje/friend-r-profile-builder' );

require_once FRPB_DIR . 'includes/github-updater.php';

add_action( 'admin_init', function () {
	// Only run inside admin to avoid hitting the GitHub API on public page loads.
	if ( defined( 'FRPB_GITHUB_REPO' ) && FRPB_GITHUB_REPO && strpos( FRPB_GITHUB_REPO, 'YOUR_GITHUB_USERNAME' ) === false ) {
		new FRPB_GitHub_Updater( FRPB_FILE, FRPB_GITHUB_REPO );
	}
} );

/**
 * Register the [friend_r_builder] shortcode.
 *
 * Usage in any post/page:
 *   [friend_r_builder]
 *   [friend_r_builder height="900"]   <!-- height of the embed area in pixels -->
 */
function frpb_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'height' => '900',
		),
		$atts,
		'friend_r_builder'
	);

	// Each instance gets its own ID so multiple shortcodes on a page don't clash.
	static $instance = 0;
	$instance++;
	$dom_id = 'frpb-' . $instance;

	// Capture the markup. The actual builder HTML lives in templates/builder.php.
	ob_start();
	?>
	<div id="<?php echo esc_attr( $dom_id ); ?>" class="frpb-shell" style="min-height: <?php echo intval( $atts['height'] ); ?>px;">
		<?php include FRPB_DIR . 'templates/builder.php'; ?>
	</div>
	<?php
	return ob_get_clean();
}
add_shortcode( 'friend_r_builder', 'frpb_shortcode' );

/**
 * Enqueue CSS + JS only on pages that actually use the shortcode.
 * Avoids loading 30KB of JS on every WP page.
 */
function frpb_enqueue_assets() {
	if ( ! is_singular() ) {
		return;
	}
	$post = get_post();
	if ( ! $post || ! has_shortcode( $post->post_content, 'friend_r_builder' ) ) {
		return;
	}

	wp_enqueue_style(
		'frpb-style',
		FRPB_URL . 'assets/style.css',
		array(),
		FRPB_VERSION
	);

	wp_enqueue_script(
		'html2canvas',
		'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
		array(),
		'1.4.1',
		true
	);

	wp_enqueue_script(
		'frpb-app',
		FRPB_URL . 'assets/app.js',
		array( 'html2canvas' ),
		FRPB_VERSION,
		true
	);

	// If user is logged into WP, auto-create/find their lead row so the email
	// gate is skipped (they don't need to give us an email — we already have it).
	$auto_lead_id    = 0;
	$auto_lead_email = '';
	if ( is_user_logged_in() ) {
		$cu = wp_get_current_user();
		if ( $cu && $cu->user_email ) {
			global $wpdb;
			$tbl = frpb_table_name();
			$row = $wpdb->get_row( $wpdb->prepare( "SELECT id FROM $tbl WHERE email = %s ORDER BY id DESC LIMIT 1", $cu->user_email ) );
			if ( $row ) {
				$auto_lead_id = (int) $row->id;
			} else {
				$wpdb->insert( $tbl, array(
					'email'      => $cu->user_email,
					'opt_in'     => 0,
					'created_at' => current_time( 'mysql' ),
					'updated_at' => current_time( 'mysql' ),
				) );
				$auto_lead_id = (int) $wpdb->insert_id;
			}
			$auto_lead_email = $cu->user_email;
		}
	}

	// Pass REST URL, nonce, Cloudinary config, current page URL, auto-lead to the JS bundle.
	wp_localize_script( 'frpb-app', 'FRPB_CFG', array(
		'restUrl'          => esc_url_raw( rest_url( 'frpb/v1/' ) ),
		'nonce'            => wp_create_nonce( 'frpb_rest' ),
		'pageUrl'          => esc_url_raw( get_permalink() ),
		'cloudinaryCloud'  => defined( 'FRPB_CLOUDINARY_CLOUD_NAME' ) ? FRPB_CLOUDINARY_CLOUD_NAME : '',
		'cloudinaryPreset' => defined( 'FRPB_CLOUDINARY_UPLOAD_PRESET' ) ? FRPB_CLOUDINARY_UPLOAD_PRESET : '',
		'isLoggedIn'       => is_user_logged_in(),
		'autoLeadId'       => $auto_lead_id,
		'autoLeadEmail'    => $auto_lead_email,
	) );
}
add_action( 'wp_enqueue_scripts', 'frpb_enqueue_assets' );

/**
 * Add a "Settings" link on the WP plugin list row.
 */
function frpb_plugin_action_links( $links ) {
	$docs_link = '<a href="' . esc_url( admin_url( 'options-general.php?page=frpb' ) ) . '">' . esc_html__( 'How to use', 'friend-r-profile-builder' ) . '</a>';
	array_unshift( $links, $docs_link );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'frpb_plugin_action_links' );

/**
 * Tiny admin page explaining how to use the plugin.
 */
function frpb_register_admin_page() {
	add_options_page(
		'friend_r Profile Builder',
		'friend_r Builder',
		'manage_options',
		'frpb',
		'frpb_render_admin_page'
	);
}
add_action( 'admin_menu', 'frpb_register_admin_page' );

function frpb_render_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1>friend_r Profile Builder</h1>
		<p>A fan-made nostalgia tribute by <a href="https://vcfyit.com" target="_blank">VCFY I.T. Solutions</a>.</p>

		<h2>How to use</h2>
		<ol>
			<li>Create a new page (e.g. <em>Build Your Profile</em>).</li>
			<li>Add a <strong>Shortcode</strong> block (or use the Custom HTML / classic editor).</li>
			<li>Paste this:
				<pre style="background:#f5f5f5;padding:10px;border:1px solid #ddd;">[friend_r_builder]</pre>
			</li>
			<li>Publish the page. Visit it. Build a profile. Share the link or screenshot.</li>
		</ol>

		<h2>Optional shortcode parameters</h2>
		<table class="widefat striped" style="max-width:600px;">
			<thead><tr><th>Parameter</th><th>Default</th><th>Description</th></tr></thead>
			<tbody>
				<tr>
					<td><code>height</code></td>
					<td><code>900</code></td>
					<td>Minimum height of the embed area, in pixels.</td>
				</tr>
			</tbody>
		</table>

		<h2>Sharing</h2>
		<p>
			When a visitor builds a profile, the URL gets a <code>#p=...</code> hash containing their full profile data
			(URL-safe base64). Anyone visiting that URL sees their profile in full-page view-mode &mdash; no signup, no backend.
		</p>

		<h2>Disclaimer</h2>
		<p>
			This plugin is a fan-made recreation for entertainment only. It is not affiliated with, endorsed by, or sponsored
			by the Friendster brand. Friendster&reg; and related marks are property of their respective owners.
		</p>
	</div>
	<?php
}
