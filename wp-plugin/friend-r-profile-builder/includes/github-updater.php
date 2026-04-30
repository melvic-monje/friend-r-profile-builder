<?php
/**
 * Lightweight GitHub-Releases-based plugin update checker.
 *
 * Hooks WordPress's update system so this plugin can be updated through
 * the normal "Plugins → Updates" flow when a new GitHub release is published.
 *
 * - Polls the GitHub Releases API for `latest`
 * - Compares its `tag_name` (e.g. "v1.2.0") to the installed version
 * - When newer, advertises the update + the zip asset URL to WP
 * - Caches the API response in a site transient (12h) to avoid rate limits
 *
 * Usage (from the main plugin file):
 *   require_once FRPB_DIR . 'includes/github-updater.php';
 *   new FRPB_GitHub_Updater( FRPB_FILE, 'owner/repo' );
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FRPB_GitHub_Updater {

	/** @var string Absolute path to the plugin's main file. */
	private $plugin_file;

	/** @var string e.g. "friend-r-profile-builder/friend-r-profile-builder.php" */
	private $plugin_basename;

	/** @var string e.g. "friend-r-profile-builder" */
	private $plugin_slug;

	/** @var string "owner/repo" */
	private $repo;

	/** @var string Transient cache key */
	private $cache_key;

	/** @var int Cache TTL in seconds */
	private $cache_ttl = 43200; // 12h

	public function __construct( $plugin_file, $repo ) {
		$this->plugin_file     = $plugin_file;
		$this->plugin_basename = plugin_basename( $plugin_file );
		$this->plugin_slug     = dirname( $this->plugin_basename );
		$this->repo            = trim( $repo, '/' );
		$this->cache_key       = 'frpb_gh_release_' . md5( $this->repo );

		add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'check_for_update' ) );
		add_filter( 'plugins_api',                            array( $this, 'plugin_info' ), 10, 3 );
		add_filter( 'upgrader_source_selection',              array( $this, 'fix_source_dir' ), 10, 4 );
		add_action( 'upgrader_process_complete',              array( $this, 'purge_cache' ),    10, 2 );
		add_filter( 'plugin_row_meta',                        array( $this, 'add_check_updates_link' ), 10, 2 );
		add_action( 'admin_post_frpb_check_updates',          array( $this, 'handle_check_updates' ) );
		add_action( 'admin_notices',                          array( $this, 'check_updates_notice' ) );
	}

	/**
	 * Adds a "Check for updates" link to our plugin's row on the Plugins page.
	 */
	public function add_check_updates_link( $links, $file ) {
		if ( $file !== $this->plugin_basename ) {
			return $links;
		}
		$url = wp_nonce_url(
			admin_url( 'admin-post.php?action=frpb_check_updates' ),
			'frpb_check_updates'
		);
		$links[] = '<a href="' . esc_url( $url ) . '">Check for updates</a>';
		return $links;
	}

	/**
	 * Handler for the "Check for updates" link click.
	 * Clears our cached release info + forces WP to re-poll.
	 */
	public function handle_check_updates() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Forbidden' );
		}
		check_admin_referer( 'frpb_check_updates' );

		// Drop our own cached release info
		delete_site_transient( $this->cache_key );
		// Drop WP's plugin update cache so it re-runs the check on next load
		delete_site_transient( 'update_plugins' );
		// Force the check now
		wp_update_plugins();

		wp_safe_redirect( add_query_arg( 'frpb_update_checked', '1', admin_url( 'plugins.php' ) ) );
		exit;
	}

	public function check_updates_notice() {
		if ( ! isset( $_GET['frpb_update_checked'] ) ) {
			return;
		}
		$release = $this->get_remote_release();
		if ( $release && version_compare( $release['version'], FRPB_VERSION, '>' ) ) {
			echo '<div class="notice notice-warning is-dismissible"><p><strong>friend_r Profile Builder:</strong> Update available — version ' . esc_html( $release['version'] ) . ' is on GitHub. Refresh this page to see the update prompt.</p></div>';
		} else {
			echo '<div class="notice notice-success is-dismissible"><p><strong>friend_r Profile Builder:</strong> You are on the latest version (' . esc_html( FRPB_VERSION ) . ').</p></div>';
		}
	}

	/**
	 * Fetches the latest GitHub release (cached). Returns:
	 *   [ 'version' => '1.2.0', 'tag' => 'v1.2.0', 'zip_url' => '...', 'changelog' => '...', 'published' => '...' ]
	 * or false on failure.
	 */
	private function get_remote_release() {
		$cached = get_site_transient( $this->cache_key );
		if ( $cached !== false ) {
			return $cached;
		}

		$url      = "https://api.github.com/repos/{$this->repo}/releases/latest";
		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 10,
				'headers' => array(
					'Accept'     => 'application/vnd.github+json',
					'User-Agent' => 'WordPress/' . get_bloginfo( 'version' ) . '; ' . get_bloginfo( 'url' ),
				),
			)
		);

		if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
			// Cache the negative for a shorter window so transient errors recover quickly
			set_site_transient( $this->cache_key, false, 5 * MINUTE_IN_SECONDS );
			return false;
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) || empty( $body['tag_name'] ) ) {
			set_site_transient( $this->cache_key, false, 5 * MINUTE_IN_SECONDS );
			return false;
		}

		// Prefer a named .zip release asset; fall back to the source archive
		$zip_url = '';
		if ( ! empty( $body['assets'] ) && is_array( $body['assets'] ) ) {
			foreach ( $body['assets'] as $asset ) {
				if ( ! empty( $asset['name'] ) && preg_match( '/\.zip$/i', $asset['name'] ) ) {
					$zip_url = isset( $asset['browser_download_url'] ) ? $asset['browser_download_url'] : '';
					break;
				}
			}
		}
		if ( ! $zip_url && ! empty( $body['zipball_url'] ) ) {
			$zip_url = $body['zipball_url'];
		}

		$release = array(
			'version'   => ltrim( $body['tag_name'], 'vV' ),
			'tag'       => $body['tag_name'],
			'zip_url'   => $zip_url,
			'changelog' => isset( $body['body'] ) ? $body['body'] : '',
			'published' => isset( $body['published_at'] ) ? $body['published_at'] : '',
			'html_url'  => isset( $body['html_url'] ) ? $body['html_url'] : "https://github.com/{$this->repo}/releases",
		);

		set_site_transient( $this->cache_key, $release, $this->cache_ttl );
		return $release;
	}

	/**
	 * Adds our update info to WP's plugin update transient when a newer tag exists.
	 */
	public function check_for_update( $transient ) {
		if ( empty( $transient->checked ) ) {
			return $transient;
		}
		$current = isset( $transient->checked[ $this->plugin_basename ] ) ? $transient->checked[ $this->plugin_basename ] : null;
		if ( ! $current ) {
			return $transient;
		}

		$release = $this->get_remote_release();
		if ( ! $release || empty( $release['zip_url'] ) ) {
			return $transient;
		}

		if ( version_compare( $release['version'], $current, '>' ) ) {
			$transient->response[ $this->plugin_basename ] = (object) array(
				'id'           => $this->plugin_basename,
				'slug'         => $this->plugin_slug,
				'plugin'       => $this->plugin_basename,
				'new_version'  => $release['version'],
				'url'          => $release['html_url'],
				'package'      => $release['zip_url'],
				'requires'     => '5.5',
				'tested'       => '6.5',
				'requires_php' => '7.2',
			);
		}
		return $transient;
	}

	/**
	 * Provides the "View details" panel content (changelog) when WP requests it.
	 */
	public function plugin_info( $result, $action, $args ) {
		if ( $action !== 'plugin_information' ) {
			return $result;
		}
		if ( empty( $args->slug ) || $args->slug !== $this->plugin_slug ) {
			return $result;
		}
		$release = $this->get_remote_release();
		if ( ! $release ) {
			return $result;
		}

		return (object) array(
			'name'          => 'friend_r Profile Builder',
			'slug'          => $this->plugin_slug,
			'version'       => $release['version'],
			'author'        => '<a href="https://vcfyit.com">VCFY I.T. Solutions</a>',
			'homepage'      => $release['html_url'],
			'requires'      => '5.5',
			'tested'        => '6.5',
			'requires_php'  => '7.2',
			'last_updated'  => $release['published'],
			'download_link' => $release['zip_url'],
			'sections'      => array(
				'description' => 'A drop-in nostalgia profile builder. Visitors build a retro early-2000s profile, share it as a screenshot or self-contained URL.',
				'changelog'   => $this->markdown_to_html( $release['changelog'] ),
			),
		);
	}

	/**
	 * GitHub source archives unzip to "owner-repo-sha/", which doesn't match the
	 * plugin's expected folder name. Rename so WP overwrites the right folder.
	 *
	 * (No-op when our release zip already has the correct folder structure.)
	 */
	public function fix_source_dir( $source, $remote_source, $upgrader, $hook_extra = null ) {
		if ( ! is_object( $upgrader ) || ! is_a( $upgrader->skin, 'Plugin_Upgrader_Skin' ) ) {
			return $source;
		}
		if ( empty( $hook_extra['plugin'] ) || $hook_extra['plugin'] !== $this->plugin_basename ) {
			return $source;
		}

		global $wp_filesystem;
		$expected = trailingslashit( $remote_source ) . $this->plugin_slug;
		$current  = untrailingslashit( $source );

		if ( $expected === $current ) {
			return $source;
		}
		if ( $wp_filesystem && $wp_filesystem->move( $current, $expected ) ) {
			return trailingslashit( $expected );
		}
		return $source;
	}

	public function purge_cache( $upgrader, $options ) {
		if ( ! isset( $options['action'], $options['type'] ) ) {
			return;
		}
		if ( $options['action'] === 'update' && $options['type'] === 'plugin' ) {
			delete_site_transient( $this->cache_key );
		}
	}

	/**
	 * Lightweight Markdown → HTML for the "View details → Changelog" panel.
	 * Only handles the common subset that GitHub release notes use.
	 */
	private function markdown_to_html( $md ) {
		if ( ! is_string( $md ) || $md === '' ) {
			return '<p><em>No release notes provided.</em></p>';
		}
		$lines  = preg_split( "/\r\n|\n|\r/", $md );
		$html   = '';
		$in_ul  = false;
		foreach ( $lines as $line ) {
			$trim = trim( $line );

			// list items
			if ( preg_match( '/^[\*\-]\s+(.+)$/', $trim, $m ) ) {
				if ( ! $in_ul ) { $html .= '<ul>'; $in_ul = true; }
				$html .= '<li>' . esc_html( $m[1] ) . '</li>';
				continue;
			}
			if ( $in_ul ) { $html .= '</ul>'; $in_ul = false; }

			// headings
			if ( preg_match( '/^### (.+)$/', $trim, $m ) ) { $html .= '<h4>' . esc_html( $m[1] ) . '</h4>'; continue; }
			if ( preg_match( '/^## (.+)$/',  $trim, $m ) ) { $html .= '<h3>' . esc_html( $m[1] ) . '</h3>'; continue; }
			if ( preg_match( '/^# (.+)$/',   $trim, $m ) ) { $html .= '<h2>' . esc_html( $m[1] ) . '</h2>'; continue; }

			if ( $trim === '' ) {
				$html .= '';
			} else {
				$html .= '<p>' . esc_html( $trim ) . '</p>';
			}
		}
		if ( $in_ul ) { $html .= '</ul>'; }
		return $html;
	}
}
