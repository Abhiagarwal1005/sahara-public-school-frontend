import { useRef, useState } from 'react';
import { uploadImage, deleteImage, imageUrl } from '../lib/cloudinary';
import { toast } from './Toast';
import { Button, cx } from './ui';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// Bill / invoice photo. The browser compresses and uploads straight to
// Cloudinary — never through the server (Vercel's 4.5MB body cap, and bandwidth).
// ---------------------------------------------------------------------------
export function ImageUpload({ value = [], onChange, folder = 'bills', max = 5, label }) {
    const [busy, setBusy] = useState(false);
    const inputRef = useRef();
    const uploadsOn = useAuth((s) => s.features.uploads);

    // Attaching a photo is optional, and so is the whole feature. With no
    // Cloudinary credentials the server reports uploads: false — show a quiet
    // line instead of a drop zone whose button would only ever return 503.
    if (!uploadsOn) {
        return (
            <div className="flex flex-col gap-1.5">
                {label && (
                    <span className="text-[12px] text-ink-2 font-medium">
                        {label} <span className="text-ink-3 font-normal">· optional</span>
                    </span>
                )}
                <p className="text-[11.5px] text-ink-3 border border-dashed border-line-2 rounded-lg px-3 py-2.5 bg-paper-2">
                    Photo attachments are not set up on this system. Everything else works as normal —
                    the bill is still recorded, just without an image.
                </p>
            </div>
        );
    }

    const handleFiles = async (files) => {
        const room = max - value.length;
        if (room <= 0) return toast.warn(`At most ${max} files`);

        setBusy(true);
        try {
            const uploaded = [];
            for (const file of Array.from(files).slice(0, room)) {
                if (file.size > 15 * 1024 * 1024) {
                    toast.warn(`${file.name} is too large (must be under 15MB)`);
                    continue;
                }
                uploaded.push(await uploadImage(file, folder));
            }
            if (uploaded.length) {
                onChange([...value, ...uploaded]);
                toast.ok(`${uploaded.length} file(s) uploaded`);
            }
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const remove = (publicId) => {
        onChange(value.filter((v) => v.publicId !== publicId));
        // Removing it from Cloudinary is best-effort — if it fails only an orphan
        // file is left, which beats blocking the form.
        deleteImage(publicId).catch(() => {});
    };

    return (
        <div className="flex flex-col gap-2">
            {label && (
                <span className="text-[12px] text-ink-2 font-medium">
                    {label} <span className="text-ink-3 font-normal">· optional</span>
                </span>
            )}

            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                className={cx(
                    'border border-dashed border-line-2 rounded-lg p-4 text-center bg-paper-2',
                    busy && 'opacity-60'
                )}
            >
                <p className="text-[13px] text-ink-2 font-medium">Add a photo of the bill</p>
                <p className="text-[11.5px] text-ink-3 mt-0.5">
                    Take a photo or drop a file · compressed in the browser before upload
                </p>
                <p className="text-[11px] text-ink-3 mt-1">
                    You can save without one — attach it later from the record.
                </p>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />

                <Button className="mt-2.5" size="sm" loading={busy} onClick={() => inputRef.current?.click()} type="button">
                    {busy ? 'Uploading' : 'Choose file'}
                </Button>
            </div>

            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map((img) => (
                        <div key={img.publicId} className="relative group">
                            <a href={imageUrl(img.publicId, { width: 1200 })} target="_blank" rel="noreferrer">
                                <img
                                    src={imageUrl(img.publicId, { width: 120, height: 140 })}
                                    alt="Bill"
                                    loading="lazy"
                                    className="w-[62px] h-[74px] object-cover rounded border border-line-2 bg-paper-2"
                                />
                            </a>
                            <button
                                type="button"
                                onClick={() => remove(img.publicId)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-line-2 text-ink-3 hover:text-crit text-xs leading-none shadow-sm"
                                aria-label="Remove"
                            >×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
