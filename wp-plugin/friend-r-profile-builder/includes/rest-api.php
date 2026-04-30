<?php
/**
 * REST API for friend_r Profile Builder.
 *
 * Endpoints (all under /wp-json/frpb/v1/):
 *   POST  /lead                  — create lead from email gate (returns id)
 *   GET   /username/{name}       — check if username is available
 *   POST  /save-profile          — save/update profile state for a username
 *   GET   /profile/{username}    — fetch profile state by username (public)
 *
 * Spam protection:
 *   - Nonce required on all writes (provided in builder template)
 *   - Per-IP rate limit on writes (transient-backed, 5/hour)
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function frpb_rest_routes() {
	register_rest_route( 'frpb/v1', '/lead', array(
		'methods'             => 'POST',
		'callback'            => 'frpb_rest_create_lead',
		'permission_callback' => '__return_true',
	) );
	register_rest_route( 'frpb/v1', '/username/(?P<name>[a-zA-Z0-9_-]{3,32})', array(
		'methods'             => 'GET',
		'callback'            => 'frpb_rest_check_username',
		'permission_callback' => '__return_true',
	) );
	register_rest_route( 'frpb/v1', '/save-profile', array(
		'methods'             => 'POST',
		'callback'            => 'frpb_rest_save_profile',
		'permission_callback' => '__return_true',
	) );
	register_rest_route( 'frpb/v1', '/profile/(?P<username>[a-zA-Z0-9_-]{3,32})', array(
		'methods'             => 'GET',
		'callback'            => 'frpb_rest_load_profile',
		'permission_callback' => '__return_true',
	) );
}
add_action( 'rest_api_init', 'frpb_rest_routes' );

/**
 * Tiny per-IP rate limiter.
 * Returns true if allowed, false if blocked.
 */
function frpb_rate_limit_ok( $bucket, $limit = 5, $window = HOUR_IN_SECONDS ) {
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
	$key  = 'frpb_rl_' . $bucket . '_' . md5( $ip );
	$hits = (int) get_transient( $key );
	if ( $hits >= $limit ) { return false; }
	set_transient( $key, $hits + 1, $window );
	return true;
}

function frpb_check_nonce( $request ) {
	// Use the standard wp_rest nonce action — same one WP itself validates for
	// logged-in REST requests, so we don't fail with "cookie check failed".
	$nonce = $request->get_header( 'X-WP-Nonce' );
	if ( ! $nonce ) { $nonce = $request->get_header( 'X-FRPB-Nonce' ); }
	if ( ! $nonce ) { $nonce = $request->get_param( '_nonce' ); }
	return $nonce && wp_verify_nonce( $nonce, 'wp_rest' );
}

function frpb_hash_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
	$salt = wp_salt( 'auth' );
	return hash_hmac( 'sha256', $ip, $salt );
}

/* =====================================================
 * POST /lead — create a lead row from the email gate
 * ===================================================== */
function frpb_rest_create_lead( $request ) {
	if ( ! frpb_check_nonce( $request ) ) {
		return new WP_Error( 'frpb_bad_nonce', 'Invalid nonce.', array( 'status' => 403 ) );
	}
	if ( ! frpb_rate_limit_ok( 'lead' ) ) {
		return new WP_Error( 'frpb_rate', 'Too many requests. Try again later.', array( 'status' => 429 ) );
	}

	$email   = sanitize_email( $request->get_param( 'email' ) );
	$opt_in  = $request->get_param( 'opt_in' ) ? 1 : 0;
	if ( ! $email || ! is_email( $email ) ) {
		return new WP_Error( 'frpb_bad_email', 'Invalid email address.', array( 'status' => 400 ) );
	}

	global $wpdb;
	$table = frpb_table_name();
	$wpdb->insert( $table, array(
		'email'      => $email,
		'opt_in'     => $opt_in,
		'ip_hash'    => frpb_hash_ip(),
		'created_at' => current_time( 'mysql' ),
		'updated_at' => current_time( 'mysql' ),
	), array( '%s', '%d', '%s', '%s', '%s' ) );

	return rest_ensure_response( array(
		'ok'      => true,
		'lead_id' => $wpdb->insert_id,
	) );
}

/* =====================================================
 * GET /username/{name} — check if username is available
 * ===================================================== */
function frpb_rest_check_username( $request ) {
	$name = $request->get_param( 'name' );
	$clean = frpb_validate_username( $name );
	if ( ! $clean ) {
		return rest_ensure_response( array(
			'available' => false,
			'reason'    => 'Invalid: 3–32 chars, a–z, 0–9, dash or underscore. Some names are reserved.',
		) );
	}
	global $wpdb;
	$table = frpb_table_name();
	$exists = $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM $table WHERE username = %s LIMIT 1", $clean ) );
	if ( $exists ) {
		return rest_ensure_response( array( 'available' => false, 'reason' => 'Already taken.' ) );
	}
	return rest_ensure_response( array( 'available' => true, 'username' => $clean ) );
}

/* =====================================================
 * Generate a globally-unique username by appending `_<rand4>` to the base.
 * Tries up to 6 random suffixes; falls back to a hashed-time suffix.
 * ===================================================== */
function frpb_unique_username_with_suffix( $base ) {
	global $wpdb;
	$table = frpb_table_name();
	$base  = preg_replace( '/_[a-z0-9]{4}$/', '', $base ); // strip prior suffix if any
	if ( strlen( $base ) > 27 ) { $base = substr( $base, 0, 27 ); }
	$alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	for ( $i = 0; $i < 6; $i++ ) {
		$suffix = '';
		for ( $j = 0; $j < 4; $j++ ) {
			$suffix .= $alphabet[ random_int( 0, 35 ) ];
		}
		$candidate = $base . '_' . $suffix;
		$exists = $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM $table WHERE username = %s LIMIT 1", $candidate ) );
		if ( ! $exists ) { return $candidate; }
	}
	// Last resort: timestamp-derived suffix (32-bit hex)
	return $base . '_' . substr( dechex( time() ), -6 );
}

/* =====================================================
 * POST /save-profile — store/update profile JSON for a username.
 * Body: { lead_id?, username, state, display_name, share_url? }
 *
 * The username is treated as the BASE — server appends `_<rand4>` to make it
 * globally unique. So the user typing "melvic" results in URL `?p=melvic_a3k7`.
 * Subsequent saves (same lead_id) reuse the existing username.
 * ===================================================== */
function frpb_rest_save_profile( $request ) {
	if ( ! frpb_check_nonce( $request ) ) {
		return new WP_Error( 'frpb_bad_nonce', 'Invalid nonce.', array( 'status' => 403 ) );
	}
	if ( ! frpb_rate_limit_ok( 'save' ) ) {
		return new WP_Error( 'frpb_rate', 'Too many requests. Try again later.', array( 'status' => 429 ) );
	}

	$lead_id       = absint( $request->get_param( 'lead_id' ) );
	$username_base = frpb_validate_username( $request->get_param( 'username' ) );
	$state         = $request->get_param( 'state' );
	$display_name  = sanitize_text_field( $request->get_param( 'display_name' ) );

	if ( ! $username_base ) {
		return new WP_Error( 'frpb_bad_username', 'Invalid username (3–32 chars, a–z, 0–9, _ or -).', array( 'status' => 400 ) );
	}
	if ( ! is_array( $state ) ) {
		return new WP_Error( 'frpb_bad_state', 'Invalid state.', array( 'status' => 400 ) );
	}
	$state_json = wp_json_encode( $state );
	if ( strlen( $state_json ) > 65000 ) {
		return new WP_Error( 'frpb_state_too_big', 'Profile too large. Make sure photos are uploaded to Cloudinary.', array( 'status' => 413 ) );
	}

	global $wpdb;
	$table = frpb_table_name();

	// Reuse existing username for this lead, if it has one. Otherwise generate a new suffixed username.
	$existing_username = null;
	if ( $lead_id ) {
		$existing_username = $wpdb->get_var( $wpdb->prepare(
			"SELECT username FROM $table WHERE id = %d LIMIT 1", $lead_id
		) );
	}
	$username = $existing_username ? $existing_username : frpb_unique_username_with_suffix( $username_base );

	// Recompute share_url with the final username
	$page_url  = esc_url_raw( $request->get_param( 'page_url' ) );
	$share_url = $page_url ? add_query_arg( 'p', $username, $page_url ) : '';

	if ( $lead_id ) {
		$wpdb->update( $table, array(
			'username'     => $username,
			'display_name' => $display_name,
			'state_json'   => $state_json,
			'share_url'    => $share_url,
			'updated_at'   => current_time( 'mysql' ),
		), array( 'id' => $lead_id ),
		   array( '%s', '%s', '%s', '%s', '%s' ),
		   array( '%d' ) );
	} else {
		// Anonymous save (no lead_id, no email captured)
		$wpdb->insert( $table, array(
			'email'        => '',
			'username'     => $username,
			'display_name' => $display_name,
			'state_json'   => $state_json,
			'share_url'    => $share_url,
			'opt_in'       => 0,
			'ip_hash'      => frpb_hash_ip(),
			'created_at'   => current_time( 'mysql' ),
			'updated_at'   => current_time( 'mysql' ),
		), array( '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s' ) );
	}

	return rest_ensure_response( array(
		'ok'        => true,
		'username'  => $username,
		'share_url' => $share_url,
	) );
}

/* =====================================================
 * GET /profile/{username} — public read-only fetch
 * ===================================================== */
function frpb_rest_load_profile( $request ) {
	$username = frpb_validate_username( $request->get_param( 'username' ) );
	if ( ! $username ) {
		return new WP_Error( 'frpb_not_found', 'Profile not found.', array( 'status' => 404 ) );
	}
	global $wpdb;
	$table = frpb_table_name();
	$row = $wpdb->get_row( $wpdb->prepare(
		"SELECT username, display_name, state_json FROM $table WHERE username = %s",
		$username
	) );
	if ( ! $row ) {
		return new WP_Error( 'frpb_not_found', 'Profile not found.', array( 'status' => 404 ) );
	}

	// Bump view count (fire-and-forget)
	$wpdb->query( $wpdb->prepare(
		"UPDATE $table SET view_count = view_count + 1 WHERE username = %s", $username
	) );

	$state = json_decode( $row->state_json, true );
	if ( ! is_array( $state ) ) { $state = array(); }
	return rest_ensure_response( array(
		'ok'           => true,
		'username'     => $row->username,
		'display_name' => $row->display_name,
		'state'        => $state,
	) );
}
