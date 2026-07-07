#!/usr/bin/env python3
"""Convert PNG to ICO and multiple PNG sizes for Britney app icon"""
from PIL import Image
import os

src = r"C:\Users\Administrator\.openclaw\workspace\generated-images\img_5fc6d86d8f485d45.png"
out_dir = r"C:\Users\Administrator\.openclaw\workspace\britney\resources"
build_dir = r"C:\Users\Administrator\.openclaw\workspace\britney\build"

# Icon sizes needed
sizes = [16, 32, 48, 64, 128, 256, 512]

# Load source image
img = Image.open(src)

# Convert to RGBA if needed
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Generate multiple PNG sizes
for size in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    # Save to resources/
    resized.save(os.path.join(out_dir, f"icon_{size}x{size}.png"), "PNG")
    print(f"Generated icon_{size}x{size}.png")

# Save main icon.png (256x256)
main_icon = img.resize((256, 256), Image.Resampling.LANCZOS)
main_icon.save(os.path.join(out_dir, "icon.png"), "PNG")
print(f"Generated icon.png (256x256)")

# Generate ICO file with multiple sizes
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_images = [img.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
ico_images[0].save(
    os.path.join(build_dir, "icon.ico"),
    format='ICO',
    sizes=ico_sizes,
    append_images=ico_images[1:]
)
print(f"Generated icon.ico")

# Also generate tray icon (smaller, simpler)
tray_icon = img.resize((32, 32), Image.Resampling.LANCZOS)
tray_icon.save(os.path.join(out_dir, "tray.png"), "PNG")
print(f"Generated tray.png (32x32)")

print("\nAll icon files generated successfully!")
