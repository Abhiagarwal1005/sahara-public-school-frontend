// ---------------------------------------------------------------------------
// THE ONE PLACE the frontend's API location is configured.
//
// Nothing else in this project should contain the API's URL. vite.config.js
// reads `API_DEV` for the dev-server proxy, and `npm run sync:vercel` writes
// `API_PROD` into vercel.json's /api rewrite.
//
// So when the API moves: change API_PROD here, run `npm run sync:vercel`,
// commit both files. That is the whole job.
//
// These are URLs, not secrets — they belong in the repo, unlike anything in
// .env (which is gitignored, and therefore cannot hold production config at
// all).
// ---------------------------------------------------------------------------

// Where `npm run dev` sends /api — your own backend, on your own machine.
// This should stay localhost forever; it is not a deployment setting.
export const API_DEV = 'http://localhost:8000';

// Where the DEPLOYED site sends /api. Change this when the API moves.
//
// The frontend and the API answer on ONE origin because of this: the browser
// only ever calls /api on its own domain, Vercel forwards it, the refresh
// cookie stays first-party, and there is no CORS preflight. That is why
// VITE_API_URL stays EMPTY in every environment — see .env.example.
export const API_PROD = 'https://sahara-public-school-backend.vercel.app';

// ---------------------------------------------------------------------------
// Cloudinary's CLOUD NAME — needed to BUILD image URLs, not to upload them.
//
// Uploading is signed by the backend, so it needs nothing here. But every
// stored publicId looks like "sps/bills/abc123", and turning that into a
// viewable URL needs the account name:
//
//   https://res.cloudinary.com/<CLOUDINARY_CLOUD>/image/upload/f_auto,q_auto/sps/bills/abc123
//
// It must match CLOUDINARY_CLOUD_NAME in the backend's environment. It is not
// a secret — it appears in every public image URL — which is why it belongs
// here rather than in .env.
//
// Leave it '' if the school has no Cloudinary account: uploads are already
// optional and the UI hides the upload box, so nothing breaks.
export const CLOUDINARY_CLOUD = 'a9w30s2i';
