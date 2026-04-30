<?php
/**
 * DB schema + activation/upgrade for friend_r Profile Builder.
 *
 * Stores leads + profiles in a single table. Photos do NOT live here —
 * they're uploaded directly to Cloudinary from the browser, and the
 * resulting URLs travel inside state_json. Each row is ~1–2 KB.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'FRPB_DB_VERSION', '1' );

function frpb_table_name() {
	global $wpdb;
	return $wpdb->prefix . 'frpb_profiles';
}

function frpb_install_db() {
	global $wpdb;
	$table_name      = frpb_table_name();
	$charset_collate = $wpdb->get_charset_collate();

	$sql = "CREATE TABLE $table_name (
		id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
		email VARCHAR(255) NOT NULL,
		username VARCHAR(32) DEFAULT NULL,
		display_name VARCHAR(255) DEFAULT NULL,
		state_json LONGTEXT,
		share_url VARCHAR(512) DEFAULT NULL,
		view_count INT UNSIGNED NOT NULL DEFAULT 0,
		opt_in TINYINT(1) NOT NULL DEFAULT 0,
		ip_hash VARCHAR(64) DEFAULT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		UNIQUE KEY uk_username (username),
		KEY ix_email (email),
		KEY ix_created (created_at)
	) $charset_collate;";

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta( $sql );
	update_option( 'frpb_db_version', FRPB_DB_VERSION );
}

function frpb_maybe_upgrade_db() {
	if ( get_option( 'frpb_db_version' ) !== FRPB_DB_VERSION ) {
		frpb_install_db();
	}
}
add_action( 'plugins_loaded', 'frpb_maybe_upgrade_db' );

/**
 * Reserved usernames — block these from being claimed.
 */
function frpb_reserved_usernames() {
	return array(
		'admin', 'administrator', 'root', 'wp', 'wp-admin', 'wpadmin',
		'login', 'logout', 'signup', 'signin', 'register',
		'api', 'rest', 'wp-json', 'wp-content', 'wp-includes',
		'support', 'help', 'contact', 'privacy', 'terms',
		'about', 'me', 'you', 'us', 'edit', 'new', 'create', 'view',
		'profile', 'profiles', 'user', 'users', 'account',
		'friend_r', 'friendster', 'vcfy', 'vcfyit',
		'feed', 'rss', 'sitemap', 'robots',
	);
}

/**
 * Sanitize + validate a username. Returns the cleaned username, or false if invalid.
 * Rules: 3–32 chars, lowercase a-z, 0-9, dash, underscore. No reserved names.
 */
function frpb_validate_username( $raw ) {
	$u = strtolower( trim( (string) $raw ) );
	if ( strlen( $u ) < 3 || strlen( $u ) > 32 ) {
		return false;
	}
	if ( ! preg_match( '/^[a-z0-9_-]+$/', $u ) ) {
		return false;
	}
	if ( in_array( $u, frpb_reserved_usernames(), true ) ) {
		return false;
	}
	return $u;
}
