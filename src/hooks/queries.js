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
    useAction((body) => post('/classes', body), { invalidate: [['classes']], success: 'Class created' });

export const useUpdateClass = () =>
    useAction(({ id, ...body }) => patch(`/classes/${id}`, body), { invalidate: [['classes']], success: 'Class updated' });

export const useCreateSession = () =>
    useAction((body) => post('/sessions', body), { invalidate: [['sessions']], success: 'Session created' });

export const useActivateSession = () =>
    useAction((id) => post(`/sessions/${id}/activate`), { invalidate: [['sessions'], ['session']], success: 'Session activated' });

// ---- students ----
export const useStudents = (params) =>
    useQuery({ queryKey: ['students', params], queryFn: () => get('/students', params), placeholderData: (p) => p });

export const useStudent = (id) =>
    useQuery({ queryKey: ['student', id], queryFn: () => get(`/students/${id}`), enabled: Boolean(id) });

export const useStudentLedger = (id) =>
    useQuery({ queryKey: ['student', id, 'ledger'], queryFn: () => get(`/students/${id}/ledger`), enabled: Boolean(id) });

export const useDefaulters = (params) =>
    useQuery({ queryKey: ['defaulters', params], queryFn: () => get('/students/defaulters', params) });

export const useCreateStudent = () =>
    useAction((body) => post('/students', body), { invalidate: [['students'], ['classes']], success: 'Student added' });

export const useUpdateStudent = () =>
    useAction(({ id, ...body }) => patch(`/students/${id}`, body), { invalidate: [['students'], ['student'], ['classes']], success: 'Student updated' });

export const useMarkLeft = () =>
    useAction((id) => del(`/students/${id}`), { invalidate: [['students'], ['student'], ['classes']], success: 'Student marked as Left' });

// ---- fees ----
export const useFeeDemands = (params) =>
    useQuery({ queryKey: ['fees', 'demands', params], queryFn: () => get('/fees/demands', params), enabled: Boolean(params?.month || params?.student) });

export const usePendingFees = (studentId) =>
    useQuery({ queryKey: ['fees', 'pending', studentId], queryFn: () => get(`/fees/pending/${studentId}`), enabled: Boolean(studentId) });

export const useFeeSummary = (month) =>
    useQuery({ queryKey: ['fees', 'summary', month], queryFn: () => get('/fees/summary', { month }), enabled: Boolean(month) });

export const useGenerateFees = () =>
    useAction((body) => post('/fees/generate', body), {
        invalidate: [['fees'], ['students'], ['dashboard'], ['reports']],
        success: (d) => (d.created ? `${d.created} fee demands raised (₹${d.totalRaised})` : d.message || 'All fees were already raised'),
    });

export const useCollectFee = (onDone) =>
    useAction((body) => post('/fees/collect', body), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['reports'], ['defaulters']],
        success: (d) => `${d.receiptNo} — ₹${d.amount} collected`,
        onDone,
    });

export const useDiscount = () =>
    useAction(({ id, ...body }) => post(`/fees/demands/${id}/discount`, body), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['defaulters']],
        success: 'Discount applied',
    });

export const useVoidReceipt = () =>
    useAction(({ id, reason }) => post(`/fees/receipts/${id}/void`, { reason }), {
        invalidate: [['fees'], ['students'], ['student'], ['dashboard'], ['reports']],
        success: 'Receipt voided',
    });

// ---- leads (enquiries) ----
// A lead is connected to nothing else in the app, so nothing here invalidates
// any other cache — and no other mutation touches ['leads'].
export const useLeads = (params) =>
    useQuery({ queryKey: ['leads', params], queryFn: () => get('/leads', params) });

export const useLeadSummary = () =>
    useQuery({ queryKey: ['leads', 'summary'], queryFn: () => get('/leads/summary') });

export const useLead = (id) =>
    useQuery({ queryKey: ['leads', 'one', id], queryFn: () => get(`/leads/${id}`), enabled: Boolean(id) });

export const useCreateLead = (onDone) =>
    useAction((body) => post('/leads', body), {
        invalidate: [['leads']],
        success: 'Enquiry saved',
        onDone,
    });

export const useUpdateLead = () =>
    useAction(({ id, ...body }) => patch(`/leads/${id}`, body), {
        invalidate: [['leads']],
        success: 'Lead updated',
    });

export const useLogFollowUp = (onDone) =>
    useAction(({ id, ...body }) => post(`/leads/${id}/follow-up`, body), {
        invalidate: [['leads']],
        success: 'Follow-up saved',
        onDone,
    });

export const useDeleteLead = (onDone) =>
    useAction((id) => del(`/leads/${id}`), {
        invalidate: [['leads']],
        success: 'Lead deleted',
        onDone,
    });

// ---- stock ----
export const useStockItems = (params) =>
    useQuery({ queryKey: ['stock', 'items', params], queryFn: () => get('/stock/items', params) });

export const useStockItem = (id) =>
    useQuery({ queryKey: ['stock', 'item', id], queryFn: () => get(`/stock/items/${id}`), enabled: Boolean(id) });

export const useLowStock = () => useQuery({ queryKey: ['stock', 'low'], queryFn: () => get('/stock/low') });

export const useMovements = (id, params) =>
    useQuery({ queryKey: ['stock', 'movements', id, params], queryFn: () => get(`/stock/items/${id}/movements`, params), enabled: Boolean(id) });

export const useCreateItem = () =>
    useAction((body) => post('/stock/items', body), { invalidate: [['stock']], success: 'Item added' });

export const useUpdateItem = () =>
    useAction(({ id, ...body }) => patch(`/stock/items/${id}`, body), { invalidate: [['stock']], success: 'Item updated' });

export const useAdjustStock = () =>
    useAction((body) => post('/stock/adjust', body), { invalidate: [['stock']], success: 'Stock adjusted' });

// ---- sales ----
export const useSales = (params) =>
    useQuery({ queryKey: ['sales', params], queryFn: () => get('/sales', params) });

export const useCreateSale = (onDone) =>
    useAction((body) => post('/sales', body), {
        invalidate: [['sales'], ['stock'], ['students'], ['student'], ['dashboard'], ['reports']],
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
        invalidate: [['sales'], ['students'], ['student'], ['dashboard'], ['reports'], ['defaulters']],
        success: (d) => `${d.receiptNo} — ₹${d.amount} received`,
        onDone,
    });

export const useVoidSale = () =>
    useAction(({ id, reason }) => post(`/sales/${id}/void`, { reason }), {
        invalidate: [['sales'], ['stock'], ['students'], ['dashboard']],
        success: 'Bill voided',
    });

// ---- vendors & purchases ----
export const useVendors = (params) =>
    useQuery({ queryKey: ['vendors', params], queryFn: () => get('/vendors', params) });

export const useVendorStatement = (id) =>
    useQuery({ queryKey: ['vendors', id, 'statement'], queryFn: () => get(`/vendors/${id}/statement`), enabled: Boolean(id) });

export const useAgeing = () => useQuery({ queryKey: ['vendors', 'ageing'], queryFn: () => get('/vendors/ageing') });

export const useCreateVendor = () =>
    useAction((body) => post('/vendors', body), { invalidate: [['vendors']], success: 'Vendor added' });

export const usePayVendor = (onDone) =>
    useAction((body) => post('/vendors/pay', body), {
        invalidate: [['vendors'], ['purchases'], ['dashboard'], ['reports']],
        success: 'Payment recorded',
        onDone,
    });

export const usePurchases = (params) =>
    useQuery({ queryKey: ['purchases', params], queryFn: () => get('/purchases', params) });

export const useCreatePurchase = (onDone) =>
    useAction((body) => post('/purchases', body), {
        invalidate: [['purchases'], ['vendors'], ['stock'], ['dashboard'], ['reports']],
        success: (d) => `Bill ${d.billNo} recorded`,
        onDone,
    });

// ---- teachers & attendance ----
export const useTeachers = (params) =>
    useQuery({ queryKey: ['teachers', params], queryFn: () => get('/teachers', params) });

export const useCreateTeacher = () =>
    useAction((body) => post('/teachers', body), { invalidate: [['teachers']], success: 'Teacher added' });

export const useUpdateTeacher = () =>
    useAction(({ id, ...body }) => patch(`/teachers/${id}`, body), { invalidate: [['teachers']], success: 'Teacher updated' });

export const useTeacherSheet = (date) =>
    useQuery({ queryKey: ['attendance', 'teachers', date], queryFn: () => get('/attendance/teachers', { date }) });

export const useTeacherGrid = (month) =>
    useQuery({ queryKey: ['attendance', 'teachers', 'grid', month], queryFn: () => get('/attendance/teachers/monthly', { month }), enabled: Boolean(month) });

export const useMarkTeachers = () =>
    useAction((body) => post('/attendance/teachers', body), {
        invalidate: [['attendance']],
        success: (d) => d.warning || 'Attendance saved',
    });

export const useClassSheet = (date) =>
    useQuery({ queryKey: ['attendance', 'classes', date], queryFn: () => get('/attendance/classes', { date }) });

export const useClassMonthly = (month) =>
    useQuery({ queryKey: ['attendance', 'classes', 'monthly', month], queryFn: () => get('/attendance/classes/monthly', { month }), enabled: Boolean(month) });

export const useMarkClasses = () =>
    useAction((body) => post('/attendance/classes', body), { invalidate: [['attendance']], success: 'Attendance saved' });

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
        invalidate: [['salary']],
        success: (d) => d.warning || `${d.created} slips created`,
    });

export const useUpdateSlip = () =>
    useAction(({ id, ...body }) => patch(`/salary/slips/${id}`, body), { invalidate: [['salary']], success: 'Slip updated' });

export const useAddAdjustment = () =>
    useAction(({ id, ...body }) => post(`/salary/slips/${id}/adjustment`, body), {
        invalidate: [['salary']],
        success: (_d, v) => `${v.kind === 'Add' ? 'Added' : 'Deducted'} ₹${v.amount} — ${v.label}`,
    });

export const useRemoveAdjustment = () =>
    useAction(({ id, adjustmentId }) => del(`/salary/slips/${id}/adjustment/${adjustmentId}`), {
        invalidate: [['salary']],
        success: 'Line removed',
    });

export const useDiscardSlip = () =>
    useAction((id) => del(`/salary/slips/${id}`), {
        invalidate: [['salary']],
        success: 'Draft discarded — press Generate to rebuild it',
    });

export const useApproveSlip = () =>
    useAction((id) => post(`/salary/slips/${id}/approve`), { invalidate: [['salary']], success: 'Slip approved — it is now frozen' });

export const usePaySlip = () =>
    useAction(({ id, ...body }) => post(`/salary/slips/${id}/pay`, body), {
        invalidate: [['salary'], ['dashboard'], ['reports']],
        success: 'Salary paid',
    });

// ---- expenses ----
export const useExpenses = (params) =>
    useQuery({ queryKey: ['expenses', params], queryFn: () => get('/expenses', params) });

export const useExpenseCategories = () =>
    useQuery({ queryKey: ['expenses', 'categories'], queryFn: () => get('/expenses/categories'), staleTime: 5 * 60_000 });

export const useExpenseByCategory = (month) =>
    useQuery({ queryKey: ['expenses', 'by-category', month], queryFn: () => get('/expenses/by-category', { month }), enabled: Boolean(month) });

export const useCreateExpense = (onDone) =>
    useAction((body) => post('/expenses', body), {
        invalidate: [['expenses'], ['dashboard'], ['reports']],
        success: 'Expense recorded',
        onDone,
    });

export const useDeleteExpense = () =>
    useAction(({ id, reason }) => del(`/expenses/${id}`, { reason }), {
        invalidate: [['expenses'], ['dashboard'], ['reports']],
        success: 'Expense deleted',
    });

export const useCreateCategory = () =>
    useAction((body) => post('/expenses/categories', body), { invalidate: [['expenses', 'categories']], success: 'Category created' });

// ---- reports ----
export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => get('/reports/dashboard') });
export const useDaybook = (date) => useQuery({ queryKey: ['reports', 'daybook', date], queryFn: () => get('/reports/daybook', { date }) });
export const useOutstanding = () => useQuery({ queryKey: ['reports', 'outstanding'], queryFn: () => get('/reports/outstanding') });
export const useIncomeExpense = () => useQuery({ queryKey: ['reports', 'income'], queryFn: () => get('/reports/income-expense') });
export const useFeeTrend = () => useQuery({ queryKey: ['reports', 'trend'], queryFn: () => get('/reports/fee-trend') });

// ---- users & permissions (Admin) ----
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => get('/users') });

export const useCreateUser = (onDone) =>
    useAction((body) => post('/users', body), { invalidate: [['users']], success: 'User created', onDone });

export const useUpdateUser = () =>
    useAction(({ id, ...body }) => patch(`/users/${id}`, body), { invalidate: [['users']], success: 'User updated' });

export const useResetPassword = (onDone) =>
    useAction((id) => post(`/users/${id}/reset-password`), { success: 'New temporary password generated', onDone });

export const usePermissions = () => useQuery({ queryKey: ['permissions'], queryFn: () => get('/permissions') });

export const useUpdatePermissions = () =>
    useAction(({ role, permissions }) => patch(`/permissions/${role}`, { permissions }), {
        invalidate: [['permissions']],
        success: 'Permissions updated — effective immediately',
    });
