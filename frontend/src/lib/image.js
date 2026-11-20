/**
 * Shrinks a photo before it is stored in a Firestore document (1 MiB limit per document).
 * Phone photos are often 3–8 MB; 900 px JPEG at quality 0.75 is usually 80–200 KB.
 */
export async function photoToDataUri(file, maxSide = 900, quality = 0.75) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPG or PNG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That photo could not be opened. Try another one.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the photo.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
