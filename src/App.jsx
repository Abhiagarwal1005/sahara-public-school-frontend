import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import { Layout } from './components/Layout';
import { RequireAuth, RequirePermission } from './components/Can';
import { Toasts } from './components/Toast';
import { Loading } from './components/ui';

// Route-level code splitting - Accountant kabhi salary ka bundle download
// download the salary bundle, and the first paint stays small.
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Leads = lazy(() => import('./pages/Leads'));
const Fees = lazy(() => import('./pages/Fees'));
const Stock = lazy(() => import('./pages/Stock'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Salary = lazy(() => import('./pages/Salary'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

const gate = (perm, el) => <RequirePermission perm={perm}>{el}</RequirePermission>;

export default function App() {
    const bootstrap = useAuth((s) => s.bootstrap);

    // On page load, try to bring the session back from the refresh cookie
    useEffect(() => { bootstrap(); }, [bootstrap]);

    return (
        <>
            <Suspense fallback={<div className="p-6"><Loading /></div>}>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    <Route element={<RequireAuth><Layout /></RequireAuth>}>
                        <Route index element={gate('report.dashboard', <Dashboard />)} />
                        <Route path="students" element={gate('student.view', <Students />)} />
                        <Route path="students/:id" element={gate('student.view', <StudentProfile />)} />
                        <Route path="leads" element={gate('lead.view', <Leads />)} />
                        <Route path="fees" element={gate('fee.view', <Fees />)} />
                        <Route path="stock" element={gate('stock.view', <Stock />)} />
                        <Route path="purchases" element={gate('purchase.view', <Purchases />)} />
                        <Route path="attendance" element={gate('attendance.teacher.view', <Attendance />)} />
                        <Route path="teachers" element={gate('teacher.view', <Teachers />)} />
                        <Route path="salary" element={gate('salary.view', <Salary />)} />
                        <Route path="expenses" element={gate('expense.view', <Expenses />)} />
                        <Route path="reports" element={gate('report.daybook', <Reports />)} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
            <Toasts />
        </>
    );
}
