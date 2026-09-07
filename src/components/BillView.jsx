import { useState } from 'react';
import { imageUrl } from '../lib/cloudinary';
import { Modal, Button, Pill } from './ui';

// ---------------------------------------------------------------------------
// A bill attachment in a list: TEXT until somebody asks to see it.
//
// This used to render a 56x56 thumbnail per row, and that is a surprisingly
// expensive default. A page of 20 expenses fetched 20 images from Cloudinary
// on EVERY visit — and the office opens this screen many times a day while
// almost never needing to look at the actual bill. On the free plan the
// register alone would burn through the monthly quota.
//
// So the row shows a label, and the image is fetched only when it is clicked.
// The <img> is inside the modal, which renders nothing until `open` — the
// browser cannot request a picture that is not in the document. Zero requests
// for a screen nobody clicks on.
//
// The full-size view is capped at w_1200 (with f_auto,q_auto from imageUrl):
// enough to read a handwritten bill, a fraction of the original upload.
// ---------------------------------------------------------------------------
export function BillView({ images = [], label = 'Bill', title = 'Bill' }) {
    const [open, setOpen] = useState(false);
    const list = (images || []).filter((i) => i?.publicId);

    if (!list.length) return <Pill>None</Pill>;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Open the bill"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border
                           border-line-2 bg-paper-2 text-ink-2 text-[11px] font-semibold
                           whitespace-nowrap hover:bg-white hover:text-brand hover:border-brand
                           transition-colors"
            >
                {/* Paper-clip. Decorative — the text beside it carries the meaning,
                    which is the same rule the status pills follow. */}
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                     strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M13 7.5l-5.2 5.2a3 3 0 01-4.2-4.2l5.6-5.6a2 2 0 012.8 2.8l-5.6 5.6a1 1 0 01-1.4-1.4l5.1-5.1" />
                </svg>
                {label}{list.length > 1 && ` ×${list.length}`}
            </button>

            {/* Mounted only while open, so nothing is fetched until then. */}
            {open && (
                <Modal
                    open
                    wide
                    onClose={() => setOpen(false)}
                    title={title}
                    footer={<Button onClick={() => setOpen(false)}>Close</Button>}
                >
                    <div className="flex flex-col gap-3">
                        {list.map((img) => (
                            <a
                                key={img.publicId}
                                href={imageUrl(img.publicId, { width: 1600 })}
                                target="_blank"
                                rel="noreferrer"
                                title="Open the full size in a new tab"
                            >
                                <img
                                    src={imageUrl(img.publicId, { width: 1200 })}
                                    alt={title}
                                    className="w-full rounded border border-line-2 bg-paper-2"
                                />
                            </a>
                        ))}
                        <p className="text-[11.5px] text-ink-3">
                            Click the image to open it full size in a new tab.
                        </p>
                    </div>
                </Modal>
            )}
        </>
    );
}
