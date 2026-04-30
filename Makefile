# friend_r Profile Builder — build + release helpers

PLUGIN_DIR = wp-plugin/friend-r-profile-builder
ASSETS     = $(PLUGIN_DIR)/assets
ZIP        = wp-plugin/friend-r-profile-builder.zip

.PHONY: help build zip clean serve

help:
	@echo "Targets:"
	@echo "  make build    Sync static/ -> WP plugin assets (scoped CSS + app.js)"
	@echo "  make zip      Build + create the installable plugin zip"
	@echo "  make clean    Remove generated zip"
	@echo "  make serve    Serve the static builder at http://localhost:8080"

build:
	node wp-plugin/scope-css.js
	cp static/app.js $(ASSETS)/app.js
	@echo "✓ Built. Edit static/* then re-run \`make build\`."

zip: build
	rm -f $(ZIP)
	cd wp-plugin && zip -rq friend-r-profile-builder.zip friend-r-profile-builder/
	@ls -lh $(ZIP)

clean:
	rm -f $(ZIP)

serve:
	@echo "Serving static/ at http://localhost:8080"
	cd static && python3 -m http.server 8080
