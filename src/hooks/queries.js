import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from '../components/Toast';

// ---------------------------------------------------------------------------
// All API access lives here. Screens never touch axios directly.
//
// The benefit: when a backend response shape changes, it changes in one
// place, not across 12 screens. And every list's cache key follows one
// convention, so invalidation stays predictable.
// ---------------------------------------------------------------------------

const get = (url, params) => api.get(url, { params }).then((r) => r.data.data);
const post = (url, body) => api.post(url, body).then((r) => r.data.data);
const patch = (url, body) => api.patch(url, body).then((r) => r.data.data);
const del = (url, body) => api.delete(url, { data: body }).then((r) => r.data.data);

// The standard mutation wrapper: success toast, error toast, and
// invalidation of affected queries — so those three are not rewritten on every screen.
const useAction = (fn, { invalidate = [], success, onDone } = {}) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: (data, vars) => {
            invalidate.forEach((key) => qc.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] }));
            if (success) toast.ok(typeof success === 'function' ? success(data, vars) : success);
            onDone?.(data, vars);
        },
        onError: (e) => toast.error(e.message),
    });
};

// ---- session / classes ----
export const useActiveSession = () =>
    useQuery({ queryKey: ['session'], queryFn: () => get('/sessions/active'), staleTime: 10 * 60_000 });

export const useSessions = () => useQuery({ queryKey: ['sessions'], queryFn: () => get('/sessions') });

export const useClasses = () =>
    useQuery({ queryKey: ['classes'], queryFn: () => get('/classes'), staleTime: 5 * 60_000 });

export const useCreateClass = () =>
    useAction((body) => post('/classes', body), { invalidate: [['classes'], ['audit']], success: 'Class created' });

export const useUpdateClass = () =>
    useAction(({ id, ...body }) => patch(`/classes/${id}`, body), { invalidate: [['classes'], ['audit']], success: 'Class updated' });

// onDone receives the created session, so the caller can activate it straight
// away — the first session has to become active or the whole app answers 409.
export const useCreateSession = (onDone) =>
    useAction((body) => post('/sessions', body), {
        invalidate: [['sessions'], ['audit']],
        success: 'Session created',
        onDone,
    });

// The session's own settings — the ID card fee is edited in place on the
// Settings list, the way a class's monthly fee is.
export const useUpdateSession = () =>
    useAction(({ id, ...body }) => patch(`/sessions/${id}`, body), {
        invalidate: [['sessions'], ['session'], ['audit']],
        success: 'Session updated',
    });

// ---------------------------------------------------------------------------
// Session rollover — the new year.
//
// The plan is read-only and is what the screen shows BEFORE anything moves.
// The two mutations invalidate almost everything, because promoting a school
// changes the roster, the classes, what is owed and what is held — there is
// very little on any screen that a rollover does not touch.
// ---------------------------------------------------------------------------
export const useRolloverPlan = (sessionId) =>
    useQuery({
        queryKey: ['rollover', sessionId],
        queryFn: () => get(`/sessions/${sessionId}/rollover`),
        enabled: Boolean(sessionId),
        // A session with nothing before it answers 400. That is an answer, not
        // a failure worth retrying three times.
        retry: false,
    });

export const useRolloverClasses = () =>
    useAction((id) => post(`/sessions/${id}/rollover/classes`), {
        invalidate: [['rollover'], ['classes'], ['sessions'], ['audit']],
        success: (d) => (d.created ? `${d.created} classes copied forward` : d.message),
    });

export const useRolloverPromote = (onDone) =>
    useAction(({ id, ...body }) => post(`/sessions/${id}/rollover`, body), {
        invalidate: [
            ['rollover'], ['students'], ['student'], ['classes'], ['defaulters'],
            ['charges'], ['reports'], ['dashboard'], ['sessions'], ['audit'],
        ],
        success: (d) =>
            d.promoted
                ? `${d.promoted} students promoted to ${d.to}`
                  + (d.arrears ? ` — ₹${d.arrears.total} of arrears carried` : '')
                : d.message,
        onDone,
    });

export const useActivateSession = () =>
    useAction((id) => post(`/sessions/${id}/activate`), {
        // ['session'] is the active-session query every screen reads; without
        // it the app keeps using the old session until that cache expires.
        invalidate: [['sessions'], ['session'], ['classes'], ['audit']],
        success: 'Session activated',
    });

// ---- students ----
export const useStudents = (params) =>
    useQuery({ queryKey: ['students', params], queryFn: () => get('/students', params), placeholderData: (p) => p });

export const useStudentLedger = (id) =>
    useQuery({ queryKey: ['student', id, 'ledger'], queryFn: () => get(`/students/${id}/ledger`), enabled: Boolean(id) });

export const useDefaulters = (params) =>
    useQuery({ queryKey: ['defaulters', params], queryFn: () => get('/students/defaulters', params), placeholderData: (p) => p });

export const useCreateStudent = () =>
    useAction((body) => post('/students', body), { invalidate: [['students'], ['classes'], ['audit']], success: 'Student added' });

export const useUpdateStudent = () =>
    useAction(({ id, ...body }) => patch(`/students/${id}`, body), { invalidate: [['students'], ['student'], ['classes'], ['audit']], success: 'Student updated' });

// The reason rides along — it is what a transfer certificate prints, and the
// office knows it on the day and never again.
export const useMarkLeft = () =>
    useAction(({ id, ...body }) => del(`/students/${id}`, body), {
        invalidate: [['students'], ['student'], ['classes'], ['defaulters'], ['reports'], ['dashboard'], ['audit']],
        success: (d) => (d.alreadyLeft ? 'This student had already left' : 'Student marked as Left'),
    });

// ---- transfer certificates ----
//
// Issuing one also takes the student off the roster, so this moves the class
// counts and every screen that counts money owed — the dues do not leave with
// the child, they just get harder to collect.
export const useIssueTC = (onDone) =>
    useAction(({ id, ...body }) => post(`/students/${id}/tc`, body), {
        invalidate: [['students'], ['student'], ['classes'], ['defaulters'], ['reports'], ['dashboard'], ['audit']],
        success: (d) =>
            `${d.tcNo} issued to ${d.name}`
            + (d.markedLeft ? ' — also marked as Left' : '')
            + (d.duesAtIssue > 0 ? ` (over ₹${d.duesAtIssue} outstanding)` : ''),
        onDone,
    });

export const useCancelTC = () =>
    useAction(({ id, reason }) => del(`/students/${id}/tc`, { reason }), {
        invalidate: [['students'], ['student'], ['classes'], ['defaulters'], ['reports'], ['dashboard'], ['audit']],
        success: (d) =>
            `${d.tcNo} cancelled`
            + (d.restoredToRoster ? ` — ${d.name} is back on the roster` : ''),
    });

// ---- siblings ----
//
// Brothers and sisters share one family group, so linking touches BOTH records
// — and, when two families merge, everybody already in either of them. Nothing
// here can know which ids moved, so ['students'] and ['student'] are both
// invalidated wholesale rather than surgically.
export const useLinkSibling = (onDone) =>
    useAction(({ id, siblingId }) => post(`/students/${id}/siblings`, { siblingId }), {
        invalidate: [['students'], ['student'], ['audit']],
        success: (d) =>
            d.merged
                ? `${d.sibling.name} linked — ${d.members.length} siblings in this family now`
                : `${d.sibling.name} linked as a sibling`,
        onDone,
    });

export const useUnlinkSibling = () =>
    useAction(({ id, siblingId }) => del(`/students/${id}/siblings/${siblingId}`), {
        invalidate: [['students'], ['student'], ['audit']],
        success: (d) => `${d.removed.name} is no longer linked`,
    });

// ---- ID cards ----
// Issuing takes money at the counter, so it moves the same caches a fee
// collection does — the dashboard, the day book and the class-wise report all
// read the rollup this writes to.
export const useIdCardSummary = () =>
    useQuery({ queryKey: ['idcards', 'summary'], queryFn: () => get('/students/id-cards/summary') });

export const useIssueIdCard = (onDone) =>
    useAction(({ id, ...body }) => post(`/students/${id}/id-card`, body), {
        invalidate: [['students'], ['student'], ['idcards'], ['dashboard'], ['reports'], ['audit']],
        success: (d) => (d.amount > 0 ? `ID card issued — ₹${d.amount} collected` : 'ID card issued (free)'),
        onDone,
    });

export const useCancelIdCard = () =>
    useAction(({ id, reason }) => del(`/students/${id}/id-card`, { reason }), {
        invalidate: [['students'], ['student'], ['idcards'], ['dashboard'], ['reports'], ['audit']],
        success: 'ID card cancelled',
    });

// ---- fees ----
export const useFeeDemands = (params) =>
    useQuery({ queryKey: ['fees', 'demands', params], queryFn: () => get('/fees/demands', params), enabled: Boolean(params?.month || params?.student), placeholderData: (p) => p });

export const usePendingFees = (studentId) =>
    useQuery({ queryKey: ['fees', 'pending', studentId], queryFn: () => get(`/fees/pending/${studentId}`), enabled: Boolean(studentId) });

export const useFeeSummary = (month) =>
    useQuery({ queryKey: ['fees', 'summary', month], queryFn: () => get('/fees/summary', { month }), enabled: Boolean(month) });

// `defaulters` is in the list because raising a month can also SETTLE it, out
// of an advance a parent already paid — so who is behind on fees changes here
// too, not only who has been billed.
export const useGenerateFees = () =>
    useAction((body) => post('/fees/generate', body), {
        invalidate: [['fees'], ['students'], ['defaulters'], ['dashboard'], ['reports'], ['audit']],
        success: (d) =>
            d.created
                ? `${d.created} fee demands raised (₹${d.totalRaised})` +
                  (d.settledFromAdvance
                      ? ` — ₹${d.settledFromAdvance} of it settled from advance already paid`
                      : '')
                : d.message || 'All fees were already raised',
    });

export const useCollectFee = (onDone) =>
    useAction((body) => post('/fees/collect', body), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['reports'], ['defaulters'], ['audit']],
        success: (d) => `${d.receiptNo} — ₹${d.amount} collected`,
        onDone,
    });

export const useDiscount = () =>
    useAction(({ id, ...body }) => post(`/fees/demands/${id}/discount`, body), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['defaulters'], ['audit']],
        success: 'Discount applied',
    });

// A receipt, fetched again for reprinting. The route and the permission both
// existed from the start — there was simply no way to open a receipt after the
// dialog that issued it had been closed, so a parent asking for a duplicate
// could not be given one.
export const useReceipt = (id) =>
    useQuery({
        queryKey: ['fees', 'receipt', id],
        queryFn: () => get(`/fees/receipts/${id}`),
        enabled: Boolean(id),
    });

// Handing an advance back — a child leaving mid-session with fee still on
// their head. Money out, so it invalidates the same screens a collection does.
export const useRefundCredit = () =>
    useAction(({ studentId, ...body }) => post(`/fees/credit/${studentId}/refund`, body), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['reports'], ['defaulters'], ['audit']],
        success: (d) => `₹${d.amount} returned to ${d.name}`,
    });

export const useVoidReceipt = () =>
    useAction(({ id, reason }) => post(`/fees/receipts/${id}/void`, { reason }), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['reports'], ['audit']],
        success: 'Receipt voided',
    });

// ---- other fees (admission, exams, trips) ----
//
// Everything a student is charged beyond the monthly fee. Collecting one moves
// the same caches a fee collection does — it is the same counter, the same
// receipt series, the same ledger and the same rollup.
export const useChargeHeads = ({ includeInactive = false } = {}) =>
    useQuery({
        queryKey: ['charges', 'heads', includeInactive],
        queryFn: () => get('/charges/heads', includeInactive ? { includeInactive: 'true' } : undefined),
        staleTime: 5 * 60_000,
    });

export const useCreateChargeHead = () =>
    useAction((body) => post('/charges/heads', body), {
        invalidate: [['charges'], ['audit']],
        success: 'Head created',
    });

export const useUpdateChargeHead = () =>
    useAction(({ id, ...body }) => patch(`/charges/heads/${id}`, body), {
        invalidate: [['charges'], ['audit']],
        success: 'Head updated',
    });

export const useCharges = (params) =>
    useQuery({ queryKey: ['charges', 'list', params], queryFn: () => get('/charges', params), placeholderData: (p) => p });

export const useChargeStudents = (id, params) =>
    useQuery({
        queryKey: ['charges', 'students', id, params],
        queryFn: () => get(`/charges/${id}/students`, params),
        enabled: Boolean(id),
        placeholderData: (p) => p,
    });

export const useRaiseCharge = (onDone) =>
    useAction((body) => post('/charges', body), {
        invalidate: [['charges'], ['students'], ['student'], ['defaulters'], ['reports'], ['dashboard'], ['audit']],
        success: (d) => `${d.charge.headName} raised on ${d.raisedFor} students (₹${d.totalRaised})`,
        onDone,
    });

export const useTopUpCharge = () =>
    useAction((id) => post(`/charges/${id}/top-up`),
        {
            invalidate: [['charges'], ['students'], ['student'], ['defaulters'], ['reports'], ['dashboard'], ['audit']],
            success: (d) => (d.added ? `${d.added} students added` : d.message),
        });

export const useCancelCharge = () =>
    useAction(({ id, reason }) => post(`/charges/${id}/cancel`, { reason }), {
        invalidate: [['charges'], ['students'], ['student'], ['defaulters'], ['reports'], ['dashboard'], ['audit']],
        success: (d) => `Cancelled — ${d.withdrawn} students no longer charged`,
    });

export const usePendingCharges = (studentId) =>
    useQuery({
        queryKey: ['charges', 'pending', studentId],
        queryFn: () => get(`/charges/pending/${studentId}`),
        enabled: Boolean(studentId),
    });

export const useCollectCharge = (onDone) =>
    useAction((body) => post('/charges/collect', body), {
        invalidate: [['charges'], ['students'], ['student'], ['dashboard'], ['reports'], ['defaulters'], ['audit']],
        success: (d) => `${d.receiptNo} — ₹${d.amount} received`,
        onDone,
    });

export const useChargeDiscount = () =>
    useAction(({ id, ...body }) => post(`/charges/demands/${id}/discount`, body), {
        invalidate: [['charges'], ['students'], ['student'], ['dashboard'], ['defaulters'], ['audit']],
        success: 'Discount applied',
    });

export const useVoidChargeReceipt = () =>
    useAction(({ id, reason }) => post(`/charges/receipts/${id}/void`, { reason }), {
        invalidate: [['charges'], ['students'], ['student'], ['dashboard'], ['reports'], ['audit']],
        success: 'Receipt voided',
    });

// ---- leads (enquiries) ----
// A lead is connected to nothing else in the app, so nothing here invalidates
// any other cache — and no other mutation touches ['leads'].
export const useLeads = (params) =>
    useQuery({ queryKey: ['leads', params], queryFn: () => get('/leads', params), placeholderData: (p) => p });

export const useLeadSummary = () =>
    useQuery({ queryKey: ['leads', 'summary'], queryFn: () => get('/leads/summary') });

export const useLead = (id) =>
    useQuery({ queryKey: ['leads', 'one', id], queryFn: () => get(`/leads/${id}`), enabled: Boolean(id) });

// "This number rang before." Not a block — a family can enquire about two
// children — but the desk should see it before typing the whole form again.
export const useLeadsByPhone = (phone) =>
    useQuery({
        queryKey: ['leads', 'by-phone', phone],
        queryFn: () => get('/leads/by-phone', { phone }),
        enabled: /^[6-9]\d{9}$/.test(String(phone || '')),
        staleTime: 60_000,
    });

export const useCreateLead = (onDone) =>
    useAction((body) => post('/leads', body), {
        invalidate: [['leads'], ['audit']],
        success: 'Enquiry saved',
        onDone,
    });

export const useUpdateLead = () =>
    useAction(({ id, ...body }) => patch(`/leads/${id}`, body), {
        invalidate: [['leads'], ['audit']],
        success: 'Lead updated',
    });

export const useLogFollowUp = (onDone) =>
    useAction(({ id, ...body }) => post(`/leads/${id}/follow-up`, body), {
        invalidate: [['leads'], ['audit']],
        success: 'Follow-up saved',
        onDone,
    });

export const useDeleteLead = (onDone) =>
    useAction((id) => del(`/leads/${id}`), {
        invalidate: [['leads'], ['audit']],
        success: 'Lead deleted',
        onDone,
    });

// ---- stock ----
export const useStockItems = (params) =>
    useQuery({ queryKey: ['stock', 'items', params], queryFn: () => get('/stock/items', params), placeholderData: (p) => p });

export const useLowStock = () => useQuery({ queryKey: ['stock', 'low'], queryFn: () => get('/stock/low') });

export const useMovements = (id, params) =>
    useQuery({ queryKey: ['stock', 'movements', id, params], queryFn: () => get(`/stock/items/${id}/movements`, params), enabled: Boolean(id), placeholderData: (p) => p });

export const useCreateItem = () =>
    useAction((body) => post('/stock/items', body), { invalidate: [['stock'], ['audit']], success: 'Item added' });

export const useUpdateItem = () =>
    useAction(({ id, ...body }) => patch(`/stock/items/${id}`, body), { invalidate: [['stock'], ['audit']], success: 'Item updated' });

export const useAdjustStock = () =>
    useAction((body) => post('/stock/adjust', body), { invalidate: [['stock'], ['audit']], success: 'Stock adjusted' });

// ---- sales ----
export const useSales = (params) =>
    useQuery({ queryKey: ['sales', params], queryFn: () => get('/sales', params), placeholderData: (p) => p });

export const useCreateSale = (onDone) =>
    useAction((body) => post('/sales', body), {
        invalidate: [['sales'], ['stock'], ['students'], ['student'], ['dashboard'], ['reports'], ['audit']],
        success: (d) => `Bill ${d.billNo} created`,
        onDone,
    });

// The unpaid bills behind a student's stock balance. Same shape as
// usePendingFees, because the two collection screens are the same screen.
export const useStockDues = (studentId) =>
    useQuery({
        queryKey: ['sales', 'dues', studentId],
        queryFn: () => get(`/sales/dues/${studentId}`),
        enabled: Boolean(studentId),
    });

export const useCollectStockDues = (onDone) =>
    useAction((body) => post('/sales/collect', body), {
        invalidate: [['sales'], ['students'], ['student'], ['dashboard'], ['reports'], ['defaulters'], ['audit']],
        success: (d) => `${d.receiptNo} — ₹${d.amount} received`,
        onDone,
    });

export const useVoidSale = () =>
    useAction(({ id, reason }) => post(`/sales/${id}/void`, { reason }), {
        // ['reports'] was missing. Voiding a bill writes a REVERSAL, so the
        // day book, the outstanding report and the cash book all move with it —
        // they were simply left showing the pre-void figures until something
        // else happened to refresh them.
        invalidate: [['sales'], ['stock'], ['students'], ['dashboard'], ['reports'], ['audit']],
        success: 'Bill voided',
    });

// ---- vendors & purchases ----
export const useVendors = (params) =>
    useQuery({ queryKey: ['vendors', params], queryFn: () => get('/vendors', params) });

export const useVendorStatement = (id) =>
    useQuery({ queryKey: ['vendors', id, 'statement'], queryFn: () => get(`/vendors/${id}/statement`), enabled: Boolean(id) });

export const useAgeing = () => useQuery({ queryKey: ['vendors', 'ageing'], queryFn: () => get('/vendors/ageing') });

export const useCreateVendor = () =>
    useAction((body) => post('/vendors', body), { invalidate: [['vendors'], ['audit']], success: 'Vendor added' });

export const useUpdateVendor = () =>
    useAction(({ id, ...body }) => patch(`/vendors/${id}`, body), {
        invalidate: [['vendors'], ['audit']],
        success: 'Vendor updated',
    });

// Every payment made to one vendor. The statement interleaves these with the
// bills; this is the plain list, for matching a UTR or a cheque number.
export const useVendorPayments = (id) =>
    useQuery({
        queryKey: ['vendors', id, 'payments'],
        queryFn: () => get(`/vendors/${id}/payments`),
        enabled: Boolean(id),
    });

export const usePayVendor = (onDone) =>
    useAction((body) => post('/vendors/pay', body), {
        invalidate: [['vendors'], ['purchases'], ['dashboard'], ['reports'], ['audit']],
        success: 'Payment recorded',
        onDone,
    });

// Note, photo and date only — the server refuses anything else, because
// changing a bill's quantities would make the stock movements lie.
export const useUpdatePurchase = () =>
    useAction(({ id, ...body }) => patch(`/purchases/${id}`, body), {
        invalidate: [['purchases'], ['vendors'], ['dashboard'], ['reports'], ['audit']],
        success: 'Bill updated',
    });

export const usePurchases = (params) =>
    useQuery({ queryKey: ['purchases', params], queryFn: () => get('/purchases', params), placeholderData: (p) => p });

export const useCreatePurchase = (onDone) =>
    useAction((body) => post('/purchases', body), {
        invalidate: [['purchases'], ['vendors'], ['stock'], ['dashboard'], ['reports'], ['audit']],
        success: (d) => `Bill ${d.billNo} recorded`,
        onDone,
    });

// ---- teachers & attendance ----
export const useTeachers = (params) =>
    useQuery({ queryKey: ['teachers', params], queryFn: () => get('/teachers', params) });

export const useCreateTeacher = () =>
    useAction((body) => post('/teachers', body), { invalidate: [['teachers'], ['audit']], success: 'Teacher added' });

export const useUpdateTeacher = () =>
    useAction(({ id, ...body }) => patch(`/teachers/${id}`, body), { invalidate: [['teachers'], ['audit']], success: 'Teacher updated' });

// Marking somebody Left is what takes them off the attendance sheet and out of
// next month's salary run. Without it a teacher who resigned stayed on both
// forever — the route existed, the permission existed, the button did not.
export const useMarkTeacherLeft = () =>
    useAction((id) => del(`/teachers/${id}`), {
        invalidate: [['teachers'], ['attendance'], ['salary'], ['audit']],
        success: 'Teacher marked as Left',
    });

export const useTeacherSheet = (date) =>
    useQuery({ queryKey: ['attendance', 'teachers', date], queryFn: () => get('/attendance/teachers', { date }) });

export const useTeacherGrid = (month) =>
    useQuery({ queryKey: ['attendance', 'teachers', 'grid', month], queryFn: () => get('/attendance/teachers/monthly', { month }), enabled: Boolean(month) });

export const useMarkTeachers = () =>
    useAction((body) => post('/attendance/teachers', body), {
        invalidate: [['attendance'], ['audit']],
        success: (d) => d.warning || 'Attendance saved',
    });

export const useClassSheet = (date) =>
    useQuery({ queryKey: ['attendance', 'classes', date], queryFn: () => get('/attendance/classes', { date }) });

export const useClassMonthly = (month) =>
    useQuery({ queryKey: ['attendance', 'classes', 'monthly', month], queryFn: () => get('/attendance/classes/monthly', { month }), enabled: Boolean(month) });

export const useMarkClasses = () =>
    useAction((body) => post('/attendance/classes', body), { invalidate: [['attendance'], ['audit']], success: 'Attendance saved' });

// ---- salary ----
export const useSlips = (params) =>
    useQuery({ queryKey: ['salary', params], queryFn: () => get('/salary/slips', params), enabled: Boolean(params?.month) });

// The open slip reads itself, rather than trusting the row the table handed
// over — otherwise adding a bonus updates the totals behind the dialog while
// the dialog itself keeps showing the old net.
export const useSlip = (id) =>
    useQuery({ queryKey: ['salary', 'slip', id], queryFn: () => get(`/salary/slips/${id}`), enabled: Boolean(id) });

export const useGenerateSalary = () =>
    useAction((body) => post('/salary/generate', body), {
        invalidate: [['salary'], ['audit']],
        success: (d) => d.warning || `${d.created} slips created`,
    });

export const useUpdateSlip = () =>
    useAction(({ id, ...body }) => patch(`/salary/slips/${id}`, body), { invalidate: [['salary'], ['audit']], success: 'Slip updated' });

export const useAddAdjustment = () =>
    useAction(({ id, ...body }) => post(`/salary/slips/${id}/adjustment`, body), {
        invalidate: [['salary'], ['audit']],
        success: (_d, v) => `${v.kind === 'Add' ? 'Added' : 'Deducted'} ₹${v.amount} — ${v.label}`,
    });

export const useRemoveAdjustment = () =>
    useAction(({ id, adjustmentId }) => del(`/salary/slips/${id}/adjustment/${adjustmentId}`), {
        invalidate: [['salary'], ['audit']],
        success: 'Line removed',
    });

export const useDiscardSlip = () =>
    useAction((id) => del(`/salary/slips/${id}`), {
        invalidate: [['salary'], ['audit']],
        success: 'Draft discarded — press Generate to rebuild it',
    });

export const useApproveSlip = () =>
    useAction((id) => post(`/salary/slips/${id}/approve`), { invalidate: [['salary'], ['audit']], success: 'Slip approved — it is now frozen' });

export const usePaySlip = () =>
    useAction(({ id, ...body }) => post(`/salary/slips/${id}/pay`, body), {
        invalidate: [['salary'], ['dashboard'], ['reports'], ['audit']],
        success: 'Salary paid',
    });

// ---- expenses ----
export const useExpenses = (params) =>
    useQuery({ queryKey: ['expenses', params], queryFn: () => get('/expenses', params), placeholderData: (p) => p });

// The expense form's picker wants live heads only. The Categories tab has to
// see the retired ones too, or retiring one would hide it with no way back.
export const useExpenseCategories = ({ includeInactive = false } = {}) =>
    useQuery({
        queryKey: ['expenses', 'categories', includeInactive],
        queryFn: () => get('/expenses/categories', includeInactive ? { includeInactive: 'true' } : undefined),
        staleTime: 5 * 60_000,
    });

export const useExpenseByCategory = (month) =>
    useQuery({ queryKey: ['expenses', 'by-category', month], queryFn: () => get('/expenses/by-category', { month }), enabled: Boolean(month) });

export const useCreateExpense = (onDone) =>
    useAction((body) => post('/expenses', body), {
        invalidate: [['expenses'], ['dashboard'], ['reports'], ['audit']],
        success: 'Expense recorded',
        onDone,
    });

// Amount, date and category are frozen by the server; the title, who it was
// paid to, the note and the photo are not. `expense.edit` has been a switch in
// Settings from the start with nothing behind it.
export const useUpdateExpense = () =>
    useAction(({ id, ...body }) => patch(`/expenses/${id}`, body), {
        invalidate: [['expenses'], ['audit']],
        success: 'Expense updated',
    });

export const useDeleteExpense = () =>
    useAction(({ id, reason }) => del(`/expenses/${id}`, { reason }), {
        invalidate: [['expenses'], ['dashboard'], ['reports'], ['audit']],
        success: 'Expense deleted',
    });

export const useCreateCategory = () =>
    useAction((body) => post('/expenses/categories', body), {
        // ['expenses','categories'] is a PREFIX — it invalidates both the live-only
        // list the picker reads and the include-inactive one the tab reads.
        invalidate: [['expenses', 'categories'], ['audit']],
        success: 'Category created',
    });

// Rename a head, or retire one. Retiring keeps it off the picker while every
// expense already filed under it stays exactly where it is — which is why the
// list has always shown an Active / Inactive pill that nothing could change.
export const useUpdateCategory = () =>
    useAction(({ id, ...body }) => patch(`/expenses/categories/${id}`, body), {
        invalidate: [['expenses'], ['audit']],
        success: 'Category updated',
    });

// ---- reports ----
// `period` is today | week | month — the money figures follow it. The
// outstanding, vendor and advance figures on the same screen do not: those are
// balances, and a balance has no period.
export const useDashboard = (period) =>
    useQuery({
        queryKey: ['dashboard', period || 'month'],
        queryFn: () => get('/reports/dashboard', period ? { period } : undefined),
        // Keep the previous period on screen while the next one loads, so the
        // tiles do not blank out every time somebody flips the toggle.
        placeholderData: (p) => p,
    });
// A date RANGE. `range` is { from, to } — both optional, and passing nothing
// asks for today, which is what the dashboard's "Today" card wants.
export const useDaybook = (range, { enabled = true } = {}) =>
    useQuery({
        queryKey: ['reports', 'daybook', range?.from || '', range?.to || ''],
        queryFn: () => get('/reports/daybook', range),
        enabled,
        // Keep the previous range on screen while the new one loads, so moving
        // the dates does not blank the table on every keystroke.
        placeholderData: (p) => p,
    });
// ---------------------------------------------------------------------------
// The cash book — what the school actually has in hand, mode by mode.
//
// `session` is optional: left out, the active one. Reads a dozen rollup
// documents, so it is cheap enough to keep fresh rather than cached hard —
// but it moves on every collection, expense and vendor payment, so every one
// of those invalidates ['cashbook'].
// ---------------------------------------------------------------------------
export const useCashbook = (session) =>
    useQuery({
        // Deliberately keyed UNDER 'reports'. Every rupee that moves already
        // invalidates ['reports'], and TanStack matches by prefix — so the cash
        // book refreshes with them instead of needing its own key added to
        // twenty-odd mutation lists, one of which somebody would eventually
        // forget. A stale balance is the one thing this screen must never show.
        queryKey: ['reports', 'cashbook', session || 'active'],
        queryFn: () => get('/reports/cashbook', session ? { session } : undefined),
        placeholderData: (p) => p,
    });

export const useOutstanding = () => useQuery({ queryKey: ['reports', 'outstanding'], queryFn: () => get('/reports/outstanding') });
export const useIncomeExpense = () => useQuery({ queryKey: ['reports', 'income'], queryFn: () => get('/reports/income-expense') });
export const useFeeTrend = () => useQuery({ queryKey: ['reports', 'trend'], queryFn: () => get('/reports/fee-trend') });

// ---- payment verification ----
// The tick is an oversight flag, not an accounting one — it moves no balance
// and writes no ledger row. So these invalidate only what DISPLAYS the flag:
// the queue itself, the day book, the student's own ledger, and the history.
// Nothing here needs the dashboard or the rollups to be refetched.
export const usePayments = (params) =>
    useQuery({
        queryKey: ['payments', params],
        queryFn: () => get('/payments', params),
        placeholderData: (p) => p,
    });

// `changed: false` means somebody else ticked the same row first. That is not a
// failure — the row holds the state the user asked for — so it gets a plain
// message rather than an error toast.
const useVerifyAction = (path, done, already) =>
    useAction((id) => post(`/payments/${id}/${path}`), {
        invalidate: [['payments'], ['reports'], ['student'], ['audit']],
        success: (d) => (d?.changed ? done : already),
    });

export const useVerifyPayment = () => useVerifyAction('verify', 'Payment verified', 'It was already verified');

export const useUnverifyPayment = () =>
    useVerifyAction('unverify', 'Verification removed', 'It was already unverified');

// Correcting what the counter wrote down, while the entry is still unchecked —
// the amount, the mode, the reference. See payment.service.js.
//
// This invalidates everything a COLLECTION would, and deliberately so. Unlike
// the tick, a corrected amount moves the months a receipt paid, the student's
// balance, the charge or the bill behind it, and the month's rollup — so the
// dues list, the defaulters, the dashboard and the day book are all capable of
// being wrong after it. Listing only the screens a mode change touches would be
// right until the first time somebody corrected a figure.
export const useUpdatePayment = () =>
    useAction(({ id, ...body }) => patch(`/payments/${id}`, body), {
        invalidate: [
            ['payments'], ['fees'], ['charges'], ['sales'], ['stock'], ['idcards'],
            ['students'], ['student'], ['defaulters'], ['dashboard'], ['reports'], ['audit'],
        ],
        success: (d) =>
            d?.amountChanged
                ? `Corrected to ₹${d.payment?.amount}`
                : d?.changed
                  ? 'Payment corrected'
                  : 'Nothing was different',
    });

// ---- edit history ----
// Who changed what. The backend gates this on `audit.view`, which only Admin
// holds by default — but it is grantable, so this is a normal query, not an
// Admin-only special case.
export const useAudit = (params) =>
    useQuery({ queryKey: ['audit', params], queryFn: () => get('/audit', params), placeholderData: (p) => p });

// One record's own trail — the panel on a student, teacher or item.
export const useEntityHistory = (entity, id) =>
    useQuery({
        queryKey: ['audit', entity, id],
        queryFn: () => get(`/audit/${entity}/${id}`),
        enabled: Boolean(entity && id),
    });

// ---- users & permissions (Admin) ----
// GET /users is adminOnly on the backend — user management deliberately sits
// outside the permission system. But `audit.view` IS grantable, so the Activity
// screen can legitimately be opened by a Principal; there it must SKIP this
// query rather than fire a guaranteed 403 on every render.
export const useUsers = ({ enabled = true } = {}) =>
    useQuery({ queryKey: ['users'], queryFn: () => get('/users'), enabled });

export const useCreateUser = (onDone) =>
    useAction((body) => post('/users', body), { invalidate: [['users'], ['audit']], success: 'User created', onDone });

export const useUpdateUser = () =>
    useAction(({ id, ...body }) => patch(`/users/${id}`, body), { invalidate: [['users'], ['audit']], success: 'User updated' });

export const useResetPassword = (onDone) =>
    useAction((id) => post(`/users/${id}/reset-password`), { success: 'New temporary password generated', onDone });

export const usePermissions = () => useQuery({ queryKey: ['permissions'], queryFn: () => get('/permissions') });

export const useUpdatePermissions = () =>
    useAction(({ role, permissions }) => patch(`/permissions/${role}`, { permissions }), {
        invalidate: [['permissions'], ['audit']],
        success: 'Permissions updated — effective immediately',
    });
