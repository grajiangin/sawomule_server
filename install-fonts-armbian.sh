#!/bin/bash

# Script to install necessary fonts and fix fontconfig on Armbian/Ubuntu systems
# Run this script as root or with sudo

echo "Installing fonts and fixing fontconfig for PDF generation..."

# Update package list
apt-get update

# Install fontconfig and basic fonts
apt-get install -y fontconfig fonts-liberation fonts-dejavu-core fonts-freefont-ttf

# Install additional fonts for better compatibility
apt-get install -y fonts-noto-core fonts-ubuntu

# Rebuild font cache
fc-cache -fv

# Create fontconfig directory if it doesn't exist
mkdir -p /etc/fonts/conf.d

# Create a basic fontconfig configuration
cat > /etc/fonts/local.conf << 'EOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir>~/.fonts</dir>
  
  <!-- Fallback fonts -->
  <alias>
    <family>serif</family>
    <prefer>
      <family>DejaVu Serif</family>
      <family>Liberation Serif</family>
      <family>Noto Serif</family>
    </prefer>
  </alias>
  
  <alias>
    <family>sans-serif</family>
    <prefer>
      <family>DejaVu Sans</family>
      <family>Liberation Sans</family>
      <family>Noto Sans</family>
    </prefer>
  </alias>
  
  <alias>
    <family>monospace</family>
    <prefer>
      <family>DejaVu Sans Mono</family>
      <family>Liberation Mono</family>
      <family>Noto Sans Mono</family>
    </prefer>
  </alias>
</fontconfig>
EOF

# Set permissions
chmod 644 /etc/fonts/local.conf

# Rebuild font cache again
fc-cache -fv

echo "Font installation complete!"
echo "You can now test font availability with: fc-list | head -10"
echo "Restart your Node.js application to apply changes."
