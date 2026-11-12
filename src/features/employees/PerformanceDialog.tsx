import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { getEmployeePerformance, type UserRecord } from '@/lib/api'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const kinds: Record<string, string> = {
  KPI_RESULT_PUBLISHED: 'نتيجة أداء منشورة',
  KPI_RESULT_ADJUSTED: 'نتيجة أداء معدّلة',
  POLICY_VIOLATION_CANDIDATE: 'ملاحظة للمراجعة',
}

export function PerformanceDialog({ token, user }: { token: string; user: UserRecord }) {
  const reportRef = useRef<HTMLDivElement>(null)
  const query = useQuery({
    queryKey: ['employee-performance', user.id],
    queryFn: () => getEmployeePerformance(token, user.id),
    staleTime: 0,
  })
  const printReport = () => {
    if (!reportRef.current) return
    const frame = document.createElement('iframe')
    frame.title = 'طباعة تقرير الأداء'
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    const printWindow = frame.contentWindow
    if (!doc || !printWindow) { frame.remove(); return }
    doc.documentElement.lang = 'ar'
    doc.documentElement.dir = 'rtl'
    doc.title = 'تقرير الأداء'
    const style = doc.createElement('style')
    style.textContent = '@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#172033;line-height:1.7}h1{font-size:20px}section{border:1px solid #bbb;border-radius:6px;padding:12px;margin:12px 0;break-inside:avoid}p{margin:4px 0}ul{margin:4px 0;padding-right:22px}strong{font-weight:bold}'
    doc.head.appendChild(style)
    const heading = doc.createElement('h1')
    heading.textContent = 'تقرير أداء ' + user.fullName
    const subtitle = doc.createElement('p')
    subtitle.textContent = 'كود الموظف: ' + user.employeeCode + ' · المصدر: نظام التذاكر'
    doc.body.append(heading, subtitle, reportRef.current.cloneNode(true))
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    printWindow.focus()
    printWindow.print()
  }
  return <>
    <DialogHeader>
      <DialogTitle>تقرير أداء {user.fullName}</DialogTitle>
      <DialogDescription>النتائج المستلمة من نظام التذاكر · {user.employeeCode}</DialogDescription>
    </DialogHeader>
    <DialogBody>
      {query.isLoading ? <p>جارٍ تحميل نتائج الأداء...</p> : query.isError ? <p role="alert">تعذر تحميل نتائج الأداء. حاول مرة أخرى.</p> : !query.data?.identityLinked ? <p>حساب الموظف غير مرتبط بالهوية المركزية، لذلك لا يمكن مطابقة نتائج الأداء.</p> : !query.data.data.length ? <p>لا توجد نتائج أداء مستلمة لهذا الموظف حتى الآن.</p> : <><div className="mb-4"><Button type="button" variant="secondary" onClick={printReport}>طباعة أو حفظ PDF</Button></div><div ref={reportRef} className="space-y-4">
        {query.data.data.map((result) => <section key={result.kpiResultId} className="rounded-lg border p-4 text-sm" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{kinds[result.kind] ?? result.kind}</strong><span>الإصدار {result.contractVersion}</span></div>
          <p className="mt-2">الفترة: {result.periodFrom} — {result.periodTo}</p>
          <p className="mt-1">النتيجة: {result.score == null ? 'غير متاحة' : `${result.score} / 100`}</p>
          {result.policyName && <p className="mt-1">السياسة: {result.policyName}{result.policyVersion != null ? ` · الإصدار ${result.policyVersion}` : ''}</p>}
          {Object.keys(result.componentScores ?? {}).length > 0 && <div className="mt-3"><strong>تفاصيل النتائج</strong><ul className="mt-1 list-inside list-disc">{Object.entries(result.componentScores).map(([name, score]) => <li key={name}>{name}: {score}</li>)}</ul></div>}
          {result.evidenceRefs?.length > 0 && <div className="mt-3"><strong>التذاكر المرتبطة</strong><ul className="mt-1 list-inside list-disc">{result.evidenceRefs.map((ref, index) => <li key={`${ref.ticketId}-${index}`}>{ref.ticketNumber || ref.ticketId}{ref.component ? ` · ${ref.component}` : ''}{ref.met == null ? '' : ref.met ? ' · تحقق' : ' · لم يتحقق'}</li>)}</ul></div>}
          {result.dispute && <p className="mt-3">حالة الاعتراض: {result.dispute.status}{result.dispute.resolution ? ` · ${result.dispute.resolution}` : ''}</p>}
        </section>)}
        {query.data.data.length === 100 && <p className="text-xs text-slate-500">تُعرض أحدث 100 نتيجة.</p>}
      </div></>}
    </DialogBody>
  </>
}
