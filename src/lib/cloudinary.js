import api from './api';
// The cloud name lives in ONE file, with the API's URL — see deploy.config.js.
import { CLOUDINARY_CLOUD } from '../../deploy.config.js';

// ---------------------------------------------------------------------------
// Straight from the browser to Cloudinary. The server only issues a
// signature — bytes never pass through it.
//
// Before uploading we downscale and re-encode via canvas. A 4MB phone
// photo of a bill becomes about 250KB. Three benefits: the upload is fast
// on a school connection, the Cloudinary free plan lasts years, and nobody
// has to stare at a progress bar.
// ---------------------------------------------------------------------------

const MAX_DIM = 1600;
const QUALITY = 0.82;

const compress = (file) =>
    new Promise((resolve, reject) => {
        // Send PDFs and non-images through untouched
        if (!file.type.startsWith('image/')) return resolve(file);

        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
            // Re-encoding an already small image just lowers quality without
            // saving any bytes
            if (scale === 1 && file.size < 400 * 1024) return resolve(file);

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => resolve(blob && blob.size < file.size ? blob : file),
                'image/jpeg',
                QUALITY
            );
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read')); };
        img.src = url;
    });

export const uploadImage = async (file, folder = 'misc') => {
    const { data } = await api.get('/uploads/signature', { params: { folder } });
    const sig = data.data;

    const blob = await compress(file);

    const form = new FormData();
    form.append('file', blob);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', sig.timestamp);
    form.append('signature', sig.signature);
    form.append('folder', sig.folder);
    form.append('transformation', sig.transformation);

    // Deliberately not the axios instance — our Authorization header must
    // never be sent to Cloudinary
    const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
    if (!res.ok) throw new Error('The image could not be uploaded');

    const out = await res.json();
    return {
        publicId: out.public_id,
        width: out.width,
        height: out.height,
        format: out.format,
        bytes: out.bytes,
    };
};

// Remove an orphaned image when a form is cancelled
export const deleteImage = (publicId) => api.post('/uploads/destroy', { publicId });

// Delivery URL. f_auto,q_auto sends the best format for the browser
// (webp/avif for Chrome) and picks the quality itself — the single biggest
// bandwidth saving available, in one line.
//
// The cloud name comes from deploy.config.js. It used to fall back to
// `publicId.split('/')[0]`, which looks like the account but is actually the
// UPLOAD FOLDER — a publicId is "sps/bills/abc123", so that fallback built
// https://res.cloudinary.com/sps/... for a cloud named something else, and
// every image 404'd. There is no sensible fallback for this value, so a
// missing one now renders nothing instead of a broken image.
let warned = false;

export const imageUrl = (publicId, { width, height } = {}) => {
    if (!publicId) return '';

    if (!CLOUDINARY_CLOUD) {
        if (!warned && import.meta.env.DEV) {
            warned = true;
            console.warn(
                '[cloudinary] CLOUDINARY_CLOUD is empty in deploy.config.js — ' +
                    'uploaded images cannot be displayed. Set it to the same value as ' +
                    "the backend's CLOUDINARY_CLOUD_NAME."
            );
        }
        return '';
    }

    const t = ['f_auto', 'q_auto'];
    if (width) t.push(`w_${width}`);
    if (height) t.push(`h_${height}`, 'c_fill');
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/${t.join(',')}/${publicId}`;
};
