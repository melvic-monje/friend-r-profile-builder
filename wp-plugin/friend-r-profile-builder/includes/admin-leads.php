<?php
/**
 * Admin "Leads" page for friend_r Profile Builder.
 *
 * WP admin → friend_r → Leads
 *   - Table view of all captured emails + their profiles
 *   - Search by email/username
 *   - Filter: opt-ins only
 *   - CSV export
 *   - Delete row
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function frpb_register_leads_menu() {
	add_menu_page(
		'friend_r',
		'friend_r',
		'manage_options',
		'frpb-leads',
		'frpb_render_leads_page',
		'dashicons-smiley',
		71
	);
	add_submenu_page(
		'frpb-leads',
		'Profiles',
		'Profiles',
		'manage_options',
		'frpb-leads',
		'frpb_render_leads_page'
	);
	add_submenu_page(
		'frpb-leads',
		'Help',
		'Help',
		'manage_options',
		'frpb',
		'frpb_render_admin_page'
	);
}
add_action( 'admin_menu', 'frpb_register_leads_menu' );

function frpb_render_leads_page() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }

	global $wpdb;
	$table = frpb_table_name();

	// --- handle actions ---
	if ( isset( $_POST['frpb_action'] ) ) {
		check_admin_referer( 'frpb_leads_action' );
		$action = sanitize_text_field( $_POST['frpb_action'] );

		if ( $action === 'delete' && ! empty( $_POST['lead_id'] ) ) {
			$wpdb->delete( $table, array( 'id' => absint( $_POST['lead_id'] ) ), array( '%d' ) );
			echo '<div class="notice notice-success is-dismissible"><p>Lead deleted.</p></div>';
		}
	}

	// --- CSV export ---
	if ( isset( $_GET['frpb_export'] ) && wp_verify_nonce( $_GET['_wpnonce'] ?? '', 'frpb_export' ) ) {
		frpb_export_csv();
		exit;
	}

	// --- query ---
	$search    = isset( $_GET['s'] ) ? sanitize_text_field( $_GET['s'] ) : '';
	$opt_only  = ! empty( $_GET['opt_in_only'] );
	$where     = array( '1=1' );
	$args      = array();
	if ( $search ) {
		$where[] = '(email LIKE %s OR username LIKE %s OR display_name LIKE %s)';
		$like    = '%' . $wpdb->esc_like( $search ) . '%';
		$args[]  = $like; $args[] = $like; $args[] = $like;
	}
	if ( $opt_only ) {
		$where[] = 'opt_in = 1';
	}
	$where_sql = implode( ' AND ', $where );
	$sql       = "SELECT * FROM $table WHERE $where_sql ORDER BY created_at DESC LIMIT 500";
	$rows      = $args ? $wpdb->get_results( $wpdb->prepare( $sql, $args ) ) : $wpdb->get_results( $sql );

	$total      = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table" );
	$with_user  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table WHERE username IS NOT NULL AND username != ''" );
	$with_email = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table WHERE email IS NOT NULL AND email != ''" );
	$opt_in_n   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table WHERE opt_in = 1" );
	$total_views= (int) $wpdb->get_var( "SELECT COALESCE(SUM(view_count),0) FROM $table" );
	$export_url = wp_nonce_url( admin_url( 'admin.php?page=frpb-leads&frpb_export=1' ), 'frpb_export' );
	?>
	<div class="wrap">
		<h1 class="wp-heading-inline">friend_r Profiles</h1>
		<a href="<?php echo esc_url( $export_url ); ?>" class="page-title-action">Export CSV</a>
		<hr class="wp-header-end">

		<div style="display:flex; gap:12px; margin:14px 0; flex-wrap:wrap;">
			<div style="background:#fff; padding:12px 16px; border:1px solid #ccd0d4; border-radius:4px; min-width:120px;">
				<strong style="font-size:24px;"><?php echo $with_user; ?></strong>
				<div style="font-size:11px; color:#666;">Profiles built</div>
			</div>
			<div style="background:#fff; padding:12px 16px; border:1px solid #ccd0d4; border-radius:4px; min-width:120px;">
				<strong style="font-size:24px;"><?php echo $total_views; ?></strong>
				<div style="font-size:11px; color:#666;">Total profile views</div>
			</div>
			<div style="background:#fff; padding:12px 16px; border:1px solid #ccd0d4; border-radius:4px; min-width:120px;">
				<strong style="font-size:24px;"><?php echo $with_email; ?></strong>
				<div style="font-size:11px; color:#666;">With email</div>
			</div>
			<div style="background:#fff; padding:12px 16px; border:1px solid #ccd0d4; border-radius:4px; min-width:120px;">
				<strong style="font-size:24px;"><?php echo $opt_in_n; ?></strong>
				<div style="font-size:11px; color:#666;">Marketing opt-ins</div>
			</div>
			<div style="background:#fff; padding:12px 16px; border:1px solid #ccd0d4; border-radius:4px; min-width:120px;">
				<strong style="font-size:24px;"><?php echo $total; ?></strong>
				<div style="font-size:11px; color:#666;">Total rows</div>
			</div>
		</div>

		<form method="get" style="margin-bottom:10px;">
			<input type="hidden" name="page" value="frpb-leads">
			<p class="search-box">
				<input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="Search by username, email, or name">
				<label style="margin-left:10px;">
					<input type="checkbox" name="opt_in_only" value="1" <?php checked( $opt_only ); ?>>
					opt-ins only
				</label>
				<button type="submit" class="button">Filter</button>
			</p>
		</form>

		<table class="wp-list-table widefat fixed striped">
			<thead>
				<tr>
					<th style="width:160px;">Username</th>
					<th>Display name</th>
					<th style="width:200px;">Email</th>
					<th style="width:60px;">Views</th>
					<th style="width:60px;">Opt-in</th>
					<th style="width:140px;">Created</th>
					<th style="width:160px;">Actions</th>
				</tr>
			</thead>
			<tbody>
				<?php if ( empty( $rows ) ) : ?>
					<tr><td colspan="7" style="text-align:center; padding:24px; color:#888;">No profiles yet.</td></tr>
				<?php else : foreach ( $rows as $row ) : ?>
					<tr>
						<td>
							<?php if ( $row->username ) : ?>
								<?php if ( $row->share_url ) : ?>
									<a href="<?php echo esc_url( $row->share_url ); ?>" target="_blank"><strong><?php echo esc_html( $row->username ); ?></strong></a>
								<?php else : ?>
									<strong><?php echo esc_html( $row->username ); ?></strong>
								<?php endif; ?>
							<?php else : ?>
								<span style="color:#888;">—</span>
							<?php endif; ?>
						</td>
						<td><?php echo esc_html( $row->display_name ?: '—' ); ?></td>
						<td>
							<?php if ( $row->email ) : ?>
								<a href="mailto:<?php echo esc_attr( $row->email ); ?>"><?php echo esc_html( $row->email ); ?></a>
							<?php else : ?>
								<span style="color:#888;">— <em style="color:#aaa; font-size:11px;">(skipped)</em></span>
							<?php endif; ?>
						</td>
						<td><?php echo (int) $row->view_count; ?></td>
						<td><?php echo $row->opt_in ? '✓' : '<span style="color:#888;">—</span>'; ?></td>
						<td><?php echo esc_html( mysql2date( 'M j, Y g:i a', $row->created_at ) ); ?></td>
						<td>
							<?php if ( $row->share_url ) : ?>
								<a href="<?php echo esc_url( $row->share_url ); ?>" target="_blank" class="button button-small">View</a>
							<?php endif; ?>
							<form method="post" style="display:inline;" onsubmit="return confirm('Delete this row?');">
								<?php wp_nonce_field( 'frpb_leads_action' ); ?>
								<input type="hidden" name="frpb_action" value="delete">
								<input type="hidden" name="lead_id" value="<?php echo (int) $row->id; ?>">
								<button class="button button-small button-link-delete" type="submit">Delete</button>
							</form>
						</td>
					</tr>
				<?php endforeach; endif; ?>
			</tbody>
		</table>

		<p style="color:#666; font-size:12px; margin-top:14px;">
			Showing up to 500 most recent rows. Use search to filter. Total in DB: <?php echo $total; ?>.
		</p>
	</div>
	<?php
}

function frpb_export_csv() {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Forbidden' ); }
	global $wpdb;
	$table = frpb_table_name();
	$rows  = $wpdb->get_results( "SELECT username, display_name, email, share_url, view_count, opt_in, created_at FROM $table ORDER BY created_at DESC", ARRAY_A );

	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename=friend-r-profiles-' . date( 'Y-m-d' ) . '.csv' );
	$out = fopen( 'php://output', 'w' );
	fputcsv( $out, array( 'Username', 'Display Name', 'Email', 'Share URL', 'View Count', 'Opt-in', 'Created' ) );
	foreach ( $rows as $r ) {
		fputcsv( $out, array(
			$r['username'], $r['display_name'], $r['email'], $r['share_url'],
			$r['view_count'], $r['opt_in'] ? 'yes' : 'no', $r['created_at'],
		) );
	}
	fclose( $out );
}
