import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createLeaveRequest, listLeaveRequests, reviewLeaveRequest, type LeaveRequest } from '@/lib/api'

export default function LeavePage({ token, permissions }: { token: string; permissions: string[] }) {
  const canReview = permissions.includes('attendance.justificationManage')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const client = useQueryClient()
  const mine = useQuery({ queryKey: ['leave', 'mine'], queryFn: () => listLeaveRequests(token) })
  const all = useQuery({ queryKey: ['leave', 'all'], queryFn: () => listLeaveRequests(token, true), enabled: canReview })
  const refresh = () => client.invalidateQueries({ queryKey: ['leave'] })
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      await createLeaveRequest(token, { startDate, endDate, reason: reason.trim(), ...(canReview && userId ? { userId: Number(userId) } : {}) })
      setStartDate(''); setEndDate(''); setReason(''); setUserId(''); await refresh()
    } catch { setError('تعذر إرسال طلب الإجازة. تحقق من البيانات وحاول مرة أخرى.') }
    finally { setBusy(false) }
  }
  const review = async (id: number, status: 'approved' | 'rejected') => {
    setError(''); setBusy(true)
    try { await reviewLeaveRequest(token, id, status); await refresh() }
    catch { setError('تعذر تسجيل القرار. قد يكون الطلب قد تمت مراجعته أو لا تملك صلاحية مراجعته.') }
    finally { setBusy(false) }
  }
  const rows = (data: LeaveRequest[], allowReview: boolean) => data.length === 0
    ? <p className="py-4 text-sm text-slate-500">لا توجد طلبات.</p>
    : <ul className="divide-y">{data.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
      <div><p className="font-semibold">{row.startDate} — {row.endDate}</p><p className="mt-1 text-slate-500">{row.reason} {allowReview && `· رقم الموظف ${row.userId}`}</p></div>
      <div className="flex items-center gap-2"><span>{row.status === 'approved' ? 'معتمدة' : row.status === 'rejected' ? 'مرفوضة' : 'قيد المراجعة'}</span>{allowReview && row.status === 'pending' && <><button type="button" disabled={busy} onClick={() => review(row.id, 'approved')} className="rounded border px-3 py-1">موافقة</button><button type="button" disabled={busy} onClick={() => review(row.id, 'rejected')} className="rounded border px-3 py-1">رفض</button></>}</div>
    </li>)}</ul>
  return <div className="mx-auto max-w-5xl space-y-5 p-4" dir="rtl">
    <div><h1 className="text-2xl font-bold">الإجازات</h1><p className="mt-1 text-sm text-slate-500">قدّم طلب إجازة وتابع حالة مراجعته.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
      <label className="space-y-1 text-sm"><span>من</span><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="block w-full rounded-lg border p-2" /></label>
      <label className="space-y-1 text-sm"><span>إلى</span><input type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="block w-full rounded-lg border p-2" /></label>
      <label className="space-y-1 text-sm sm:col-span-2"><span>السبب</span><textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="block w-full rounded-lg border p-2" /></label>
      {canReview && <label className="space-y-1 text-sm sm:col-span-2"><span>رقم الموظف في HR (اختياري؛ اتركه فارغًا لطلب إجازتك)</span><input type="number" min="1" step="1" value={userId} onChange={(e) => setUserId(e.target.value)} className="block w-full rounded-lg border p-2" /></label>}
      <button disabled={busy || !reason.trim()} className="w-fit rounded-lg bg-blue-800 px-5 py-2 text-sm text-white disabled:opacity-50">إرسال الطلب</button>
    </form>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">طلباتي</h2>{mine.isLoading ? <p>جارٍ التحميل…</p> : mine.isError ? <p role="alert">تعذر تحميل الطلبات.</p> : rows(mine.data ?? [], false)}</section>
    {canReview && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">مراجعة الطلبات</h2>{all.isLoading ? <p>جارٍ التحميل…</p> : all.isError ? <p role="alert">تعذر تحميل الطلبات.</p> : rows(all.data ?? [], true)}</section>}
  </div>
}
