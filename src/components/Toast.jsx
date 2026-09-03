import { create } from 'zustand';
import { cx } from './ui';

// A small toast store. Every mutation reports success or failure through
// it, so no screen invents its own notification pattern.
export const useToast = create((set, get) => ({
    items: [],
    push: (message, tone = 'ok') => {
        const id = Math.random().toString(36).slice(2);
        set({ items: [...get().items, { id, message, tone }] });
        setTimeout(() => set({ items: get().items.filter((t) => t.id !== id) }), 4000);
    },
    dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = {
    ok: (m) => useToast.getState().push(m, 'ok'),
    warn: (m) => useToast.getState().push(m, 'warn'),
    error: (m) => useToast.getState().push(m || 'Something went wrong', 'crit'),
};

const TONES = {
    ok: 'bg-good-bg border-good text-good',
    warn: 'bg-warn-bg border-warn text-warn',
    crit: 'bg-crit-bg border-crit text-crit',
};

export function Toasts() {
    const { items, dismiss } = useToast();
    return (
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] no-print">
            {items.map((t) => (
                <div
                    key={t.id}
                    role="status"
                    onClick={() => dismiss(t.id)}
                    className={cx('border rounded-md px-3.5 py-2.5 text-[12.5px] shadow-card cursor-pointer', TONES[t.tone])}
                >
                    {t.message}
                </div>
            ))}
        </div>
    );
}
