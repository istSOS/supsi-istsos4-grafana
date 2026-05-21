#!/bin/bash
set -e
cd /plugin

# Set proper permissions for directories we can control (skip mounted files)
echo "Setting up permissions for development..."
# Only try to set permissions on directories we can actually modify
find /plugin -type d -exec chmod 755 {} \; 2>/dev/null || true
find /plugin -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

# Create a local working directory for builds if needed
mkdir -p /tmp/plugin-build
chown -R 472:0 /tmp/plugin-build 2>/dev/null || true

# Install dependencies if node_modules doesn't exist or is empty
if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules)" ]; then
    echo "Installing npm dependencies..."
    # Run as root first, then change ownership
    npm install || {
        echo "Failed to install dependencies as root, trying as grafana user..."
        su-exec 472:0 npm install
    }
    # Try to set ownership, but don't fail if we can't
    chown -R 472:0 node_modules 2>/dev/null || true
fi

# Build the plugin initially
echo "Initial plugin build..."
# Try to build as grafana user, fallback to root if needed
su-exec 472:0 npm run build 2>/dev/null || {
    echo "Build failed as grafana user, trying as root..."
    npm run build
    # Try to set ownership of dist directory
    chown -R 472:0 dist 2>/dev/null || true
}

echo "Building backend plugin executable..."
if command -v go >/dev/null 2>&1; then
    su-exec 472:0 go run github.com/magefile/mage -v 2>/dev/null || {
        echo "Backend build failed as grafana user, trying as root..."
        go run github.com/magefile/mage -v
        chown -R 472:0 dist 2>/dev/null || true
    }
    chmod +x dist/gpx_ist_sos4_grafana_* 2>/dev/null || true
else
    echo "Go is not installed; backend alerting executable was not built."
fi

# Ensure Grafana plugins directory exists and has proper permissions
echo "Setting up Grafana plugins directory..."
mkdir -p /var/lib/grafana/plugins/supsi-istsos4-datasource
chown -R 472:0 /var/lib/grafana/plugins/supsi-istsos4-datasource 2>/dev/null || true

# Start file watching and live reload in development mode
if [ "$NODE_ENV" = "development" ] && [ "$ENABLE_LIVE_RELOAD" = "true" ]; then
    echo "Starting live reload development mode..."
    
    # Start the webpack dev server with live reload (in background)
    su-exec 472:0 bash -c 'cd /plugin && npm run dev' &
    
    # Start live reload notification server (in background)
    node /usr/local/bin/livereload-server.js &
    
    echo "Live reload enabled - changes to source files will trigger rebuilds"
fi

echo "Development environment ready! Starting Grafana..."

# Start Grafana
exec "$@"
