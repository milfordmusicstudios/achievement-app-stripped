const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function cropIcons() {
  try {
    // Crop and zoom the 192x192 icon - more aggressive crop
    const temp192 = 'images/pwa/icon-192-temp.png';
    await sharp('images/pwa/icon-192.png')
      .extract({ left: 55, top: 55, width: 82, height: 82 })
      .resize(192, 192)
      .toFile(temp192);
    fs.renameSync(temp192, 'images/pwa/icon-192.png');
    console.log('✓ 192x192 icon cropped and zoomed (aggressive)');

    // Crop and zoom the 512x512 icon - more aggressive crop
    const temp512 = 'images/pwa/icon-512-temp.png';
    await sharp('images/pwa/icon-512.png')
      .extract({ left: 160, top: 160, width: 192, height: 192 })
      .resize(512, 512)
      .toFile(temp512);
    fs.renameSync(temp512, 'images/pwa/icon-512.png');
    console.log('✓ 512x512 icon cropped and zoomed (aggressive)');

    console.log('\nIcons have been successfully enlarged with minimal margins!');
  } catch (err) {
    console.error('Error processing icons:', err);
  }
}

cropIcons();
